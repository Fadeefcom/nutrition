namespace FitnessDiary.Api.Functions;

internal static class QueryHelpers
{
    public static string? Get(Uri uri, string key)
    {
        var query = uri.Query.TrimStart('?');
        if (string.IsNullOrWhiteSpace(query))
        {
            return null;
        }

        foreach (var segment in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = segment.Split('=', 2);
            var name = Uri.UnescapeDataString(parts[0]);
            if (!string.Equals(name, key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return parts.Length == 2 ? Uri.UnescapeDataString(parts[1].Replace("+", " ")) : "";
        }

        return null;
    }
}

