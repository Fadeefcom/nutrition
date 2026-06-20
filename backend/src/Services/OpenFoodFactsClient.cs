using System.Globalization;
using System.Text.Json;
using FitnessDiary.Api.Models;

namespace FitnessDiary.Api.Services;

public sealed class OpenFoodFactsClient(HttpClient httpClient)
{
    public async Task<Product?> FindByBarcodeAsync(string barcode, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.GetAsync($"api/v2/product/{Uri.EscapeDataString(barcode)}.json", cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;

        if (!root.TryGetProperty("status", out var status) || status.GetInt32() != 1)
        {
            return null;
        }

        if (!root.TryGetProperty("product", out var product))
        {
            return null;
        }

        product.TryGetProperty("nutriments", out var nutriments);
        var now = DateTimeOffset.UtcNow;

        var servingSize = GetDecimal(product, "serving_quantity") ?? 100;

        return new Product
        {
            Id = Guid.NewGuid().ToString("n"),
            Name = GetString(product, "product_name") ?? "Imported product",
            Brand = GetString(product, "brands") ?? "",
            Barcode = barcode,
            ServingSizeGrams = servingSize,
            ServingSizeAmount = servingSize,
            ServingSizeUnit = "g",
            CaloriesPer100g = GetDecimal(nutriments, "energy-kcal_100g", "energy-kcal") ?? 0,
            ProteinPer100g = GetDecimal(nutriments, "proteins_100g", "protein_100g") ?? 0,
            CarbsPer100g = GetDecimal(nutriments, "carbohydrates_100g") ?? 0,
            FatPer100g = GetDecimal(nutriments, "fat_100g") ?? 0,
            FiberPer100g = GetDecimal(nutriments, "fiber_100g") ?? 0,
            Source = "open_food_facts",
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    private static string? GetString(JsonElement element, string name)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(name, out var value)
            && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }

    private static decimal? GetDecimal(JsonElement element, params string[] names)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var name in names)
        {
            if (!element.TryGetProperty(name, out var value))
            {
                continue;
            }

            if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
            {
                return number;
            }

            if (value.ValueKind == JsonValueKind.String
                && decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }
}
