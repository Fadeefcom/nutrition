using System.Net;
using System.Text.Json;
using FitnessDiary.Api.Extensions;
using FitnessDiary.Api.Models;
using FitnessDiary.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace FitnessDiary.Api.Functions;

public sealed class ProgressFunctions(IJsonRepository repository, JsonSerializerOptions json)
{
    [Function("GetProgressSummary")]
    public async Task<HttpResponseData> GetProgressSummary(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "progress/summary")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var days = int.TryParse(QueryHelpers.Get(request.Url, "days"), out var parsedDays)
            ? Math.Clamp(parsedDays, 7, 3650)
            : 84;
        var settings = await repository.GetOrCreateAsync(BlobNames.Settings, Defaults.Settings, cancellationToken);
        var to = QueryHelpers.Get(request.Url, "to");
        var end = string.IsNullOrWhiteSpace(to)
            ? DateOnly.FromDateTime(DateTime.Now)
            : DateOnly.Parse(to);
        var start = end.AddDays(-days + 1);
        var points = new List<ProgressPoint>();
        var statuses = new List<DailyStatus>();
        var exercisePoints = new Dictionary<string, List<ExerciseProgressPoint>>(StringComparer.OrdinalIgnoreCase);

        foreach (var date in DiaryCalculations.DateRange(start.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd")))
        {
            var nutrition = await repository.GetAsync<DailyNutrition>(BlobNames.Nutrition(date), cancellationToken);
            var workout = await repository.GetAsync<DailyWorkout>(BlobNames.Workouts(date), cancellationToken);
            var metric = await repository.GetAsync<BodyMetric>(BlobNames.BodyMetrics(date), cancellationToken);
            var normalizedNutrition = nutrition is null ? null : DiaryCalculations.Normalize(nutrition);
            var normalizedWorkout = workout is null ? null : DiaryCalculations.Normalize(workout);

            points.Add(new ProgressPoint
            {
                Date = date,
                Calories = normalizedNutrition?.Totals.Calories ?? 0,
                Protein = normalizedNutrition?.Totals.Protein ?? 0,
                WorkoutVolume = normalizedWorkout?.TotalVolume ?? 0,
                WorkoutCount = normalizedWorkout?.Exercises.Any(x => x.Sets.Count > 0) == true ? 1 : 0,
                BodyWeightKg = metric?.WeightKg
            });

            statuses.Add(DiaryCalculations.BuildDailyStatus(date, settings, nutrition, workout, metric));

            if (normalizedWorkout is null)
            {
                continue;
            }

            foreach (var exercise in normalizedWorkout.Exercises)
            {
                if (!exercisePoints.ContainsKey(exercise.ExerciseName))
                {
                    exercisePoints[exercise.ExerciseName] = [];
                }

                exercisePoints[exercise.ExerciseName].Add(new ExerciseProgressPoint
                {
                    Date = date,
                    ExerciseName = exercise.ExerciseName,
                    Reps = exercise.Sets.Sum(x => x.Reps),
                    BestSet = exercise.Sets.Count == 0 ? 0 : exercise.Sets.Max(x => x.Reps),
                    Volume = exercise.Sets.Sum(x => x.Reps * x.AddedWeightKg)
                });
            }
        }

        return await request.JsonAsync(HttpStatusCode.OK, new ProgressSummary
        {
            Days = points,
            Statuses = statuses,
            Exercises = exercisePoints
        }, json, cancellationToken);
    }

    [Function("GetExerciseProgress")]
    public async Task<HttpResponseData> GetExerciseProgress(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "progress/exercise/{exerciseName}")] HttpRequestData request,
        string exerciseName,
        CancellationToken cancellationToken)
    {
        var days = int.TryParse(QueryHelpers.Get(request.Url, "days"), out var parsedDays)
            ? Math.Clamp(parsedDays, 7, 3650)
            : 180;
        var to = QueryHelpers.Get(request.Url, "to");
        var end = string.IsNullOrWhiteSpace(to)
            ? DateOnly.FromDateTime(DateTime.Now)
            : DateOnly.Parse(to);
        var start = end.AddDays(-days + 1);
        var points = new List<ExerciseProgressPoint>();

        foreach (var date in DiaryCalculations.DateRange(start.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd")))
        {
            var workout = await repository.GetAsync<DailyWorkout>(BlobNames.Workouts(date), cancellationToken);
            var exercise = workout?.Exercises.FirstOrDefault(x =>
                string.Equals(x.ExerciseName, exerciseName, StringComparison.OrdinalIgnoreCase));

            if (exercise is null)
            {
                continue;
            }

            points.Add(new ExerciseProgressPoint
            {
                Date = date,
                ExerciseName = exercise.ExerciseName,
                Reps = exercise.Sets.Sum(x => x.Reps),
                BestSet = exercise.Sets.Count == 0 ? 0 : exercise.Sets.Max(x => x.Reps),
                Volume = exercise.Sets.Sum(x => x.Reps * x.AddedWeightKg)
            });
        }

        return await request.JsonAsync(HttpStatusCode.OK, points, json, cancellationToken);
    }
}
