import { getEnvOfThrow } from "../utils/env";
import { HourlyForecastPeriod, NwsClient } from "./shared.ts/nsw-client";
import { NtfyClient } from "./shared.ts/ntfy-client";

const NTFY_TOPIC = getEnvOfThrow("NTFY_TOPIC");
const LATITUDE = getEnvOfThrow("LATITUDE");
const LONGITUDE = getEnvOfThrow("LONGITUDE");
const NWS_USER_AGENT = getEnvOfThrow("NWS_USER_AGENT");

enum clothingEnum {
  jacket = "jacket",
  shirt = "shirt",
  hoodie = "hoodie",
}

// Main handler — EventBridge triggers this every hour
export async function handler(): Promise<void> {
  const nwsClient = await NwsClient.create({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    userAgent: NWS_USER_AGENT,
  });

  const currentWeather = await nwsClient.getHourlyForecast();
  const clothing = getSuggestedClothing(currentWeather);

  // default in SF is 'HOODIE', report only edge cases
  if (clothingEnum.hoodie === clothing) {
    console.log("Not reporting default 'hoodie' clothing suggestion");
    return;
  }

  const message = formatMessage(currentWeather, clothing);

  const ntfyClient = new NtfyClient({
    ntfyTopic: NTFY_TOPIC,
    messageTitle: "Hourly Weather Alert",
  });
  await ntfyClient.sendPushNotification(message);

  console.log("Hourly Forecast sent:", message);
}

function getSuggestedClothing(weather: HourlyForecastPeriod): clothingEnum {
  const windSpeedMph = parseInt(weather.windSpeed.split(" ")[0]);
  if (
    windSpeedMph < 5 &&
    weather.shortForecast === "Sunny" &&
    weather.temperature > 65
  ) {
    return clothingEnum.shirt;
  }
  if (windSpeedMph > 10 || weather.temperature < 65) return clothingEnum.jacket;
  return clothingEnum.hoodie;
}

function formatMessage(
  weather: HourlyForecastPeriod,
  clothing: clothingEnum,
): string {
  return [
    `Right now: ${weather.temperature}°${weather.temperatureUnit}, ${weather.shortForecast}`,
    `Wind: ${weather.windSpeed}`,
    `Wear: ${clothing}`,
  ].join("\n");
}
