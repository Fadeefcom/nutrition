using FitnessDiary.Api.Models;

namespace FitnessDiary.Api.Services;

public static class DiaryCalculations
{
    private const decimal FiberGramsPer1000Calories = 14m;

    public static MacroTargets MacroTargets(NutritionTarget target) => new()
    {
        Calories = target.TargetCalories,
        ProteinGrams = Math.Round(target.TargetCalories * target.ProteinPercent / 100m / 4m, 0),
        CarbsGrams = Math.Round(target.TargetCalories * target.CarbsPercent / 100m / 4m, 0),
        FatGrams = Math.Round(target.TargetCalories * target.FatPercent / 100m / 9m, 0),
        FiberGrams = Math.Round(Math.Max(0, target.TargetCalories) / 1000m * FiberGramsPer1000Calories, 0)
    };

    public static DailyNutrition Normalize(DailyNutrition day)
    {
        var totals = new NutritionTotals
        {
            Calories = Math.Round(day.Entries.Sum(x => x.Calories), 1),
            Protein = Math.Round(day.Entries.Sum(x => x.Protein), 1),
            Carbs = Math.Round(day.Entries.Sum(x => x.Carbs), 1),
            Fat = Math.Round(day.Entries.Sum(x => x.Fat), 1),
            Fiber = Math.Round(day.Entries.Sum(x => x.Fiber), 1)
        };

        return day with { Totals = totals };
    }

    public static DailyWorkout Normalize(DailyWorkout day)
    {
        var totalReps = day.Exercises.Sum(exercise => exercise.Sets.Sum(set => Math.Max(0, set.Reps)));
        var totalVolume = day.Exercises.Sum(exercise =>
            exercise.Sets.Sum(set => Math.Max(0, set.Reps) * Math.Max(0, set.AddedWeightKg)));

        return day with
        {
            TotalReps = totalReps,
            TotalVolume = Math.Round(totalVolume, 1)
        };
    }

    public static ExerciseProgress ExerciseProgress(
        ExerciseTarget target,
        DailyWorkout? workout,
        int bestSession = 0,
        string? lastSession = null)
    {
        var exercise = workout?.Exercises.FirstOrDefault(x =>
            string.Equals(x.ExerciseName, target.ExerciseName, StringComparison.OrdinalIgnoreCase));

        var sets = exercise?.Sets ?? [];
        var completedReps = sets.Sum(x => Math.Max(0, x.Reps));
        var targetTotal = target.TargetTotalReps > 0
            ? target.TargetTotalReps
            : (int)(target.TargetSets * target.TargetRepsPerSet);
        var completion = targetTotal <= 0 ? 0 : Math.Min(100, Math.Round(completedReps / (decimal)targetTotal * 100m, 1));
        var targetSetsCompleted = sets.Count(x => x.Reps >= target.TargetRepsPerSet);
        var targetReached = targetSetsCompleted >= target.TargetSets;

        return new ExerciseProgress
        {
            ExerciseName = target.ExerciseName,
            CompletedReps = completedReps,
            TargetReps = targetTotal,
            CompletionPercent = completion,
            BestSet = sets.Count == 0 ? 0 : sets.Max(x => x.Reps),
            BestSession = Math.Max(bestSession, completedReps),
            LastSession = lastSession,
            TargetReached = targetReached,
            Recommendation = targetReached
                ? "Add weight next time"
                : completedReps > 0
                    ? "Keep building toward the target sets"
                    : "Log a session to start progress"
        };
    }

    public static DailyStatus BuildDailyStatus(
        string date,
        Settings settings,
        DailyNutrition? nutrition,
        DailyWorkout? workout,
        BodyMetric? bodyMetric)
    {
        var targets = MacroTargets(settings.NutritionTarget);
        var normalizedNutrition = nutrition is null ? null : Normalize(nutrition);
        var normalizedWorkout = workout is null ? null : Normalize(workout);
        var totals = normalizedNutrition?.Totals ?? new NutritionTotals();
        var hasNutrition = normalizedNutrition?.Entries.Count > 0;
        var hasWorkout = normalizedWorkout?.Exercises.Any(x => x.Sets.Count > 0) == true;

        var exerciseProgress = settings.ExerciseTargets
            .Where(x => x.IsActive)
            .Select(target => ExerciseProgress(target, normalizedWorkout))
            .ToList();

        var workoutPercent = exerciseProgress.Count == 0
            ? 0
            : Math.Round(exerciseProgress.Average(x => x.CompletionPercent), 1);
        var workoutState = !hasWorkout
            ? "gray"
            : exerciseProgress.All(x => x.TargetReached)
                ? "green"
                : exerciseProgress.Any(x => x.CompletionPercent > 0)
                    ? "yellow"
                    : "red";

        var calories = RangeStatus(totals.Calories, targets.Calories, 0.95m, 1.05m, hasNutrition, "Calories");
        var protein = MinimumStatus(totals.Protein, targets.ProteinGrams, 0.95m, hasNutrition, "Protein");
        var carbs = RangeStatus(totals.Carbs, targets.CarbsGrams, 0.90m, 1.10m, hasNutrition, "Carbs");
        var fat = RangeStatus(totals.Fat, targets.FatGrams, 0.80m, 1.20m, hasNutrition, "Fat");
        var fiber = MinimumStatus(totals.Fiber, targets.FiberGrams, 0.90m, hasNutrition, "Fiber");

        var workoutMetric = new StatusMetric
        {
            State = workoutState,
            Actual = exerciseProgress.Sum(x => x.CompletedReps),
            Target = exerciseProgress.Sum(x => x.TargetReps),
            Percent = workoutPercent,
            Label = "Workout"
        };

        var fullDayMetrics = new[] { calories, protein, carbs, fat, fiber, workoutMetric };
        var fullDayState = FullDayState(fullDayMetrics);

        return new DailyStatus
        {
            Date = date,
            Calories = calories,
            Protein = protein,
            Carbs = carbs,
            Fat = fat,
            Fiber = fiber,
            Workout = workoutMetric,
            FullDay = new StatusMetric
            {
                State = fullDayState,
                Actual = fullDayMetrics.Count(x => x.State == "green"),
                Target = 6,
                Percent = Math.Round(fullDayMetrics.Average(x => x.Percent), 1),
                Label = "Full day"
            },
            BodyWeightKg = bodyMetric?.WeightKg,
            ExerciseTargets = exerciseProgress,
            Notes = string.Join(" ", new[] { normalizedNutrition?.Notes, normalizedWorkout?.Notes, bodyMetric?.Notes }
                .Where(x => !string.IsNullOrWhiteSpace(x)))
        };
    }

    public static IEnumerable<string> DateRange(string from, string to)
    {
        var start = DateOnly.Parse(from);
        var end = DateOnly.Parse(to);
        for (var date = start; date <= end; date = date.AddDays(1))
        {
            yield return date.ToString("yyyy-MM-dd");
        }
    }

    private static StatusMetric RangeStatus(
        decimal actual,
        decimal target,
        decimal low,
        decimal high,
        bool? hasData,
        string label)
    {
        var percent = target <= 0 ? 0 : Math.Round(actual / target * 100m, 1);
        var state = hasData != true
            ? "gray"
            : actual >= target * low && actual <= target * high
                ? "green"
                : actual > target * high || actual < target * 0.50m
                    ? "red"
                    : "yellow";

        return new StatusMetric
        {
            State = state,
            Actual = Math.Round(actual, 1),
            Target = Math.Round(target, 1),
            Percent = percent,
            Label = label
        };
    }

    private static StatusMetric MinimumStatus(
        decimal actual,
        decimal target,
        decimal minimum,
        bool? hasData,
        string label)
    {
        var percent = target <= 0 ? 0 : Math.Round(actual / target * 100m, 1);
        var state = hasData != true
            ? "gray"
            : actual >= target * minimum
                ? "green"
                : actual < target * 0.50m
                    ? "red"
                    : "yellow";

        return new StatusMetric
        {
            State = state,
            Actual = Math.Round(actual, 1),
            Target = Math.Round(target, 1),
            Percent = percent,
            Label = label
        };
    }

    private static string FullDayState(IReadOnlyCollection<StatusMetric> metrics)
    {
        if (metrics.All(x => x.State == "gray"))
        {
            return "gray";
        }

        if (metrics.All(x => x.State == "green"))
        {
            return "green";
        }

        if (metrics.Any(x => x.State == "red"))
        {
            return "red";
        }

        return "yellow";
    }
}
