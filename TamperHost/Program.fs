open System
open Microsoft.AspNetCore.Builder
open Microsoft.Extensions.Hosting
open Microsoft.Extensions.DependencyInjection
open Microsoft.AspNetCore.StaticFiles

let builder = WebApplication.CreateBuilder()

// Enable directory browsing (optional but handy during dev)
builder.Services.AddDirectoryBrowser() |> ignore

let app = builder.Build()

// Configure MIME types (so .user.js serves as JavaScript)
let provider = FileExtensionContentTypeProvider()
provider.Mappings[".user.js"] <- "application/javascript"

// Serve static files out of wwwroot with correct MIME
app.UseStaticFiles(
    StaticFileOptions(
        ContentTypeProvider = provider,
        ServeUnknownFileTypes = true
    )
) |> ignore

// Enable directory browsing at / (optional)
app.UseDirectoryBrowser() |> ignore

// Root endpoint
app.MapGet("/", Func<string>(fun () -> "TamperHost is running")) |> ignore

// Health check endpoint
app.MapGet("/healthz", Func<string>(fun () -> "ok")) |> ignore

app.Run()
