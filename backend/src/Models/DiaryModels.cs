namespace FitnessDiary.Api.Models;

public sealed record Profile
{
    public string Name { get; init; } = "Athlete";
    public decimal? HeightCm { get; init; }
    public int? Age { get; init; } = 30;
    public string Sex { get; init; } = "male";
    public decimal ActivityMultiplier { get; init; } = 1.55m;
    public decimal? TargetWeightKg { get; init; }
    public string TimeZone { get; init; } = "Europe/Lisbon";
    public string Notes { get; init; } = "";
}

public sealed record Settings
{
    public NutritionTarget NutritionTarget { get; init; } = new();
    public List<string> DefaultExercises { get; init; } = [];
    public List<ExerciseTarget> ExerciseTargets { get; init; } = [];
    public string TargetMode { get; init; } = "lean_bulk";
    public string Theme { get; init; } = "dark";
}

public sealed record NutritionTarget
{
    public int TargetCalories { get; init; } = 2985;
    public int CalorieAdjustment { get; init; } = 300;
    public decimal ProteinPercent { get; init; } = 20;
    public decimal CarbsPercent { get; init; } = 60;
    public decimal FatPercent { get; init; } = 20;
    public decimal FiberTargetGrams { get; init; } = 35;
    public string TargetMode { get; init; } = "lean_bulk";
}

public sealed record MacroTargets
{
    public decimal Calories { get; init; }
    public decimal ProteinGrams { get; init; }
    public decimal CarbsGrams { get; init; }
    public decimal FatGrams { get; init; }
    public decimal FiberGrams { get; init; }
}

public sealed record ExerciseTarget
{
    public string Id { get; init; } = Guid.NewGuid().ToString("n");
    public string ExerciseName { get; init; } = "";
    public int TargetSets { get; init; } = 4;
    public decimal TargetRepsPerSet { get; init; } = 15;
    public int TargetTotalReps { get; init; } = 60;
    public decimal TargetAddedWeightKg { get; init; }
    public string TargetType { get; init; } = "reps";
    public string ProgressionRule { get; init; } = "Add weight next time when every target set is completed.";
    public bool IsActive { get; init; } = true;
}

public sealed record Product
{
    public string Id { get; init; } = Guid.NewGuid().ToString("n");
    public string Name { get; init; } = "";
    public string Brand { get; init; } = "";
    public string Barcode { get; init; } = "";
    public decimal ServingSizeGrams { get; init; } = 100;
    public decimal? ServingSizeAmount { get; init; }
    public string? ServingSizeUnit { get; init; }
    public List<ProductCustomServing> CustomServings { get; init; } = [];
    public decimal CaloriesPer100g { get; init; }
    public decimal ProteinPer100g { get; init; }
    public decimal CarbsPer100g { get; init; }
    public decimal FatPer100g { get; init; }
    public decimal FiberPer100g { get; init; }
    public string Source { get; init; } = "manual";
    public string Notes { get; init; } = "";
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record ProductCustomServing
{
    public string Id { get; init; } = Guid.NewGuid().ToString("n");
    public string Name { get; init; } = "";
    public decimal Amount { get; init; }
    public string? Unit { get; init; }
}

public sealed record NutritionEntry
{
    public string Id { get; init; } = Guid.NewGuid().ToString("n");
    public string MealType { get; init; } = "snack";
    public string ProductId { get; init; } = "";
    public string ProductName { get; init; } = "";
    public decimal Grams { get; init; }
    public decimal? DisplayAmount { get; init; }
    public string? AmountUnit { get; init; }
    public string? ServingLabel { get; init; }
    public decimal Calories { get; init; }
    public decimal Protein { get; init; }
    public decimal Carbs { get; init; }
    public decimal Fat { get; init; }
    public decimal Fiber { get; init; }
    public string Notes { get; init; } = "";
}

public sealed record NutritionTotals
{
    public decimal Calories { get; init; }
    public decimal Protein { get; init; }
    public decimal Carbs { get; init; }
    public decimal Fat { get; init; }
    public decimal Fiber { get; init; }
}

public sealed record DailyNutrition
{
    public string Date { get; init; } = "";
    public List<NutritionEntry> Entries { get; init; } = [];
    public NutritionTotals Totals { get; init; } = new();
    public string Notes { get; init; } = "";
}

public sealed record WorkoutSet
{
    public int Reps { get; init; }
    public decimal AddedWeightKg { get; init; }
    public bool IsBodyweight { get; init; } = true;
    public decimal? Rir { get; init; }
    public decimal? Rpe { get; init; }
    public string Notes { get; init; } = "";
}

public sealed record WorkoutExercise
{
    public string ExerciseName { get; init; } = "";
    public List<WorkoutSet> Sets { get; init; } = [];
    public string Notes { get; init; } = "";
}

public sealed record DailyWorkout
{
    public string Date { get; init; } = "";
    public string Title { get; init; } = "";
    public List<WorkoutExercise> Exercises { get; init; } = [];
    public string Notes { get; init; } = "";
    public int TotalReps { get; init; }
    public decimal TotalVolume { get; init; }
}

public sealed record BodyMetric
{
    public string Date { get; init; } = "";
    public decimal? WeightKg { get; init; }
    public decimal? BodyFatPercent { get; init; }
    public decimal? WaistCm { get; init; }
    public string Notes { get; init; } = "";
}

public sealed record StatusMetric
{
    public string State { get; init; } = "gray";
    public decimal Actual { get; init; }
    public decimal Target { get; init; }
    public decimal Percent { get; init; }
    public string Label { get; init; } = "";
}

public sealed record ExerciseProgress
{
    public string ExerciseName { get; init; } = "";
    public int CompletedReps { get; init; }
    public int TargetReps { get; init; }
    public decimal CompletionPercent { get; init; }
    public int BestSet { get; init; }
    public int BestSession { get; init; }
    public string? LastSession { get; init; }
    public bool TargetReached { get; init; }
    public string Recommendation { get; init; } = "";
}

public sealed record DailyStatus
{
    public string Date { get; init; } = "";
    public StatusMetric Calories { get; init; } = new();
    public StatusMetric Protein { get; init; } = new();
    public StatusMetric Carbs { get; init; } = new();
    public StatusMetric Fat { get; init; } = new();
    public StatusMetric Fiber { get; init; } = new();
    public StatusMetric Workout { get; init; } = new();
    public StatusMetric FullDay { get; init; } = new();
    public decimal? BodyWeightKg { get; init; }
    public List<ExerciseProgress> ExerciseTargets { get; init; } = [];
    public string Notes { get; init; } = "";
}

public sealed record ProgressPoint
{
    public string Date { get; init; } = "";
    public decimal Calories { get; init; }
    public decimal Protein { get; init; }
    public decimal WorkoutVolume { get; init; }
    public int WorkoutCount { get; init; }
    public decimal? BodyWeightKg { get; init; }
}

public sealed record ExerciseProgressPoint
{
    public string Date { get; init; } = "";
    public string ExerciseName { get; init; } = "";
    public int Reps { get; init; }
    public int BestSet { get; init; }
    public decimal Volume { get; init; }
}

public sealed record ProgressSummary
{
    public List<ProgressPoint> Days { get; init; } = [];
    public List<DailyStatus> Statuses { get; init; } = [];
    public Dictionary<string, List<ExerciseProgressPoint>> Exercises { get; init; } = new();
}
