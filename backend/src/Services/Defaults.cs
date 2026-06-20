using FitnessDiary.Api.Models;

namespace FitnessDiary.Api.Services;

public static class Defaults
{
    public static Profile Profile() => new()
    {
        Name = "Athlete",
        Age = 30,
        Sex = "male",
        ActivityMultiplier = 1.55m,
        TargetWeightKg = null,
        TimeZone = "Europe/Lisbon",
        Notes = "Personal fitness diary"
    };

    public static Settings Settings() => new()
    {
        NutritionTarget = NutritionTarget(),
        DefaultExercises =
        [
            "Pull-ups",
            "Dips",
            "Pike Push-ups",
            "Push-ups",
            "Pistol Squats",
            "Calf Raises",
            "Leg Raises"
        ],
        ExerciseTargets = ExerciseTargets(),
        TargetMode = "lean_bulk",
        Theme = "dark"
    };

    public static NutritionTarget NutritionTarget() => new()
    {
        TargetCalories = 2985,
        CalorieAdjustment = 300,
        ProteinPercent = 20,
        CarbsPercent = 60,
        FatPercent = 20,
        FiberTargetGrams = 35,
        TargetMode = "lean_bulk"
    };

    public static List<ExerciseTarget> ExerciseTargets() =>
    [
        Target("Pull-ups", 4, 15),
        Target("Dips", 4, 15),
        Target("Pike Push-ups", 4, 15),
        Target("Pistol Squats", 4, 15, "per leg"),
        Target("Calf Raises", 4, 25)
    ];

    public static List<Product> Products() =>
    [
        new Product
        {
            Name = "Greek Yogurt",
            Brand = "Seed",
            ServingSizeGrams = 170,
            ServingSizeAmount = 170,
            ServingSizeUnit = "g",
            CaloriesPer100g = 59,
            ProteinPer100g = 10,
            CarbsPer100g = 3.6m,
            FatPer100g = 0.4m,
            FiberPer100g = 0,
            Source = "seed"
        },
        new Product
        {
            Name = "Rolled Oats",
            Brand = "Seed",
            ServingSizeGrams = 50,
            ServingSizeAmount = 50,
            ServingSizeUnit = "g",
            CaloriesPer100g = 389,
            ProteinPer100g = 16.9m,
            CarbsPer100g = 66.3m,
            FatPer100g = 6.9m,
            FiberPer100g = 10.6m,
            Source = "seed"
        }
    ];

    public static DailyNutrition DailyNutrition(string date) => new()
    {
        Date = date,
        Entries = [],
        Totals = new NutritionTotals()
    };

    public static DailyWorkout DailyWorkout(string date) => new()
    {
        Date = date,
        Title = "Workout",
        Exercises = [],
        TotalReps = 0,
        TotalVolume = 0
    };

    public static BodyMetric BodyMetric(string date) => new()
    {
        Date = date
    };

    private static ExerciseTarget Target(string name, int sets, int reps, string suffix = "") => new()
    {
        ExerciseName = name,
        TargetSets = sets,
        TargetRepsPerSet = reps,
        TargetTotalReps = sets * reps,
        TargetType = "reps",
        ProgressionRule = string.IsNullOrWhiteSpace(suffix)
            ? "Add weight next time when every target set is completed."
            : $"Complete {sets} x {reps} {suffix}, then add difficulty or weight.",
        IsActive = true
    };
}
