using System.Net;
using FitnessDiary.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.Extensions.Configuration;

namespace FitnessDiary.Api.Auth;

public sealed class SimplePasswordMiddleware(IConfiguration configuration) : IFunctionsWorkerMiddleware
{
    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        var password = ConfigurationReader.Get(configuration, "DiaryPassword");
        if (string.IsNullOrWhiteSpace(password))
        {
            await next(context);
            return;
        }

        var request = await context.GetHttpRequestDataAsync();
        if (request is null || string.Equals(request.Method, "OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        if (request.Headers.TryGetValues("x-diary-password", out var values)
            && string.Equals(values.FirstOrDefault(), password, StringComparison.Ordinal))
        {
            await next(context);
            return;
        }

        var response = request.CreateResponse(HttpStatusCode.Unauthorized);
        response.Headers.Add("Content-Type", "application/json");
        await response.WriteStringAsync("""{"error":"Invalid diary password."}""");
        context.GetInvocationResult().Value = response;
    }
}
