import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getEnvOfThrow } from "../utils/env";
import { NwsClient, WeatherData } from "./shared.ts/nsw-client";
import { NtfyClient } from "./shared.ts/ntfy-client";

const bedrock = new BedrockRuntimeClient({});

const NTFY_TOPIC = getEnvOfThrow("NTFY_TOPIC");
const LATITUDE = getEnvOfThrow("LATITUDE");
const LONGITUDE = getEnvOfThrow("LONGITUDE");
const NWS_USER_AGENT = getEnvOfThrow("NWS_USER_AGENT");

async function getClothingAdvice(weather: WeatherData): Promise<string> {
  const prompt = `Today's forecast for ${weather.city}, ${weather.state}:
- Daytime (${weather.daytime.name}): ${weather.daytime.temperature}°${weather.daytime.temperatureUnit}, ${weather.daytime.shortForecast}
- Wind: ${weather.daytime.windSpeed} ${weather.daytime.windDirection}
- Rain chance: ${weather.daytime.probabilityOfPrecipitation}%
- Tonight: ${weather.nighttime.temperature}°${weather.nighttime.temperatureUnit}, ${weather.nighttime.shortForecast}

What should I wear today? Give me a practical recommendation in one to two sentences. Be direct and specific. No preamble.`;

  const body = JSON.stringify({
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 80,
    },
  });

  const command = new InvokeModelCommand({
    modelId: "amazon.nova-lite-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(body),
  });

  const response = await bedrock.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.output.message.content[0].text;
}

// Step 4: format the notification message
function formatMessage(weather: WeatherData, advice: string): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

  return [
    `${weather.city}, ${weather.state} — ${today}`,
    `${weather.daytime.name}: ${weather.daytime.temperature}°${weather.daytime.temperatureUnit}, ${weather.daytime.shortForecast}`,
    `Tonight: ${weather.nighttime.temperature}°${weather.nighttime.temperatureUnit}, ${weather.nighttime.shortForecast}`,
    `Wind: ${weather.daytime.windSpeed} ${weather.daytime.windDirection} | Rain: ${weather.daytime.probabilityOfPrecipitation}%`,
    "",
    advice,
  ].join("\n");
}

// Main handler — EventBridge triggers this every morning
export async function handler(): Promise<void> {
  const nwsClient = await NwsClient.create({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    userAgent: NWS_USER_AGENT,
  });
  const weather = await nwsClient.getMorningForecast();
  const advice = await getClothingAdvice(weather);
  const message = formatMessage(weather, advice);

  const ntfyClient = new NtfyClient({
    ntfyTopic: NTFY_TOPIC,
    messageTitle: "Morning Forecast",
  });
  await ntfyClient.sendPushNotification(message);

  console.log("Forecast sent:", message);
}
