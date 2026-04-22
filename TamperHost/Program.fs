open System
open System.Collections.Concurrent
open System.Net.WebSockets
open System.Text
open System.IO
open System.Threading
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.Hosting
open Microsoft.Extensions.DependencyInjection
open Microsoft.AspNetCore.StaticFiles

let builder = WebApplication.CreateBuilder()
builder.Services.AddDirectoryBrowser() |> ignore

let app = builder.Build()

// Registry of connected browser clients waiting for reload signals
let clients = ConcurrentDictionary<Guid, WebSocket>()

// Configure MIME types (so .user.js serves as JavaScript)
let provider = FileExtensionContentTypeProvider()
provider.Mappings[".user.js"] <- "application/javascript"

// UseWebSockets must come before static files and routing
app.UseWebSockets() |> ignore

app.UseStaticFiles(
    StaticFileOptions(
        ContentTypeProvider = provider,
        ServeUnknownFileTypes = true
    )
) |> ignore

app.UseDirectoryBrowser() |> ignore

// Browser clients connect here and wait for reload signals
let wsHandler (ctx: HttpContext) : Task =
    task {
        if ctx.WebSockets.IsWebSocketRequest then
            let! ws = ctx.WebSockets.AcceptWebSocketAsync()
            let id = Guid.NewGuid()
            clients.TryAdd(id, ws) |> ignore
            let buf = Array.zeroCreate<byte> 256
            try
                let mutable running = true
                while running do
                    let! result = ws.ReceiveAsync(ArraySegment<byte>(buf), CancellationToken.None)
                    if result.MessageType = WebSocketMessageType.Close then
                        do! ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None)
                        running <- false
            finally
                clients.TryRemove(id) |> ignore
        else
            ctx.Response.StatusCode <- 400
    }

app.Map("/ws", RequestDelegate(wsHandler)) |> ignore

// build-plus.js POSTs here after each successful rebuild in watch mode
let reloadHandler (ctx: HttpContext) : Task =
    task {
        if ctx.Request.Method = "POST" then
            use reader = new StreamReader(ctx.Request.Body)
            let! filename = reader.ReadToEndAsync()
            let payload =
                let f = filename.Trim()
                if f <> "" then $"reload:{f}" else "reload"
            let msg = Encoding.UTF8.GetBytes(payload)
            let seg = ArraySegment<byte>(msg)
            for kvp in clients do
                if kvp.Value.State = WebSocketState.Open then
                    try
                        do! kvp.Value.SendAsync(seg, WebSocketMessageType.Text, true, CancellationToken.None)
                    with _ -> ()
        ctx.Response.StatusCode <- 204
    }

app.Map("/_dev/reload", RequestDelegate(reloadHandler)) |> ignore

app.MapGet("/", Func<string>(fun () -> "TamperHost is running")) |> ignore
app.MapGet("/healthz", Func<string>(fun () -> "ok")) |> ignore

app.Run()
