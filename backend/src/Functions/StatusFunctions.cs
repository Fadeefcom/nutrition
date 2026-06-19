using System.Net;
using System.Text.Json;
using FitnessDiary.Api.Extensions;
using FitnessDiary.Api.Models;
using FitnessDiary.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace FitnessDiary.Api.Functions;

public sealed class StatusFunctions(IJsonRepository repository, JsonSerializerOptions json)
{
    [Function("GetDailyStatus")]
    public async Task<HttpResponseData> GetDailyStatus(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "daily-status/{date}")] HttpRequestData request,
        string date,
        CancellationToken cancellationToken)
    {
        var status = await BuildStatusAsync(date, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, status, json, cancellationToken);
    }

    [Function("GetDailyStatusRange")]
    public async Task<HttpResponseData> GetDailyStatusRange(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "daily-status/range")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var from = QueryHelpers.Get(request.Url, "from") ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-27)).ToString("yyyy-MM-dd");
        var to = QueryHelpers.Get(request.Url, "to") ?? DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");
        var statuses = new List<DailyStatus>();

        foreach (var date in DiaryCalculations.DateRange(from, to))
        {
            statuses.Add(await BuildStatusAsync(date, cancellationToken));
        }

        return await request.JsonAsync(HttpStatusCode.OK, statuses, json, cancellationToken);
    }

    private async Task<DailyStatus> BuildStatusAsync(string date, CancellationToken cancellationToken)
    {
        var settings = await repository.GetOrCreateAsync(BlobNames.Settings, Defaults.Settings, cancellationToken);
        var nutrition = await repository.GetAsync<DailyNutrition>(BlobNames.Nutrition(date), cancellationToken);
        var workout = await repository.GetAsync<DailyWorkout>(BlobNames.Workouts(date), cancellationToken);
        var metric = await repository.GetAsync<BodyMetric>(BlobNames.BodyMetrics(date), cancellationToken);
        return DiaryCalculations.BuildDailyStatus(date, settings, nutrition, workout, metric);
    }
}

