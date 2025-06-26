open System
open Microsoft.AspNetCore.Builder
open Microsoft.Extensions.Hosting

let builder = WebApplication.CreateBuilder()
let app     = builder.Build()

app.UseStaticFiles() |> ignore
app.MapGet("/", Func<string>(fun () -> "TamperHost is running")) |> ignore

app.Run()
