import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

const LATITUDE = process.env.LATITUDE;
const LONGITUDE = process.env.LONGITUDE;
const NTFY_TOPIC = process.env.NTFY_TOPIC;

const NWS_USER_AGENT =
  "daily-notification-bit (https://github.com/alexey-labs/daily-notification-bot)";

interface NswReport {
  forecastUrl: string;
  city: string;
  state: string;
}

interface ForecastPeriod {
  name: string;
  temperature: string;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  probabilityOfPrecipitation: string;
  isDaytime: boolean;
}

interface WeatherData {
  city: string;
  state: string;
  daytime: ForecastPeriod;
  nighttime: ForecastPeriod;
}

// Step 1: Get NWS grid point for our coordinates
async function getNwsPoint(): Promise<NswReport> {
  const url = `	https://api.weather.gov/points/${LATITUDE},${LONGITUDE}`;
  const response = await fetch(url, {
    headers: { "User-Agent": NWS_USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`NWS points API error: ${response.status}`);
  }

  const data: any = await response.json();
  return {
    forecastUrl: data.properties.forecast,
    city: data.properties.relativeLocation.properties.city,
    state: data.properties.relativeLocation.properties.state,
  };
}

// Step 2: get the forecase from the NWS grid point
async function getForecast(point: NswReport): Promise<WeatherData> {
  const response = await fetch(point.forecastUrl, {
    headers: { "User-Agent": NWS_USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`NWS forecase API error: ${response.status}`);
  }

  const data: any = await response.json();
  const periods = data.properties.periods;

  const daytime = periods.find((p: any) => p.isDaytime);
  const nighttime = periods.find((p: any) => !p.isDaytime);

  function toPeriod(p: any): ForecastPeriod {
    return {
      name: p.name,
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit,
      windSpeed: p.windSpeed,
      windDirection: p.windDirection,
      shortForecast: p.shortForecast,
      probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value ?? 0,
      isDaytime: p.isDaytime,
    };
  }

  return {
    city: point.city,
    state: point.state,
    daytime: toPeriod(daytime),
    nighttime: toPeriod(nighttime),
  };
}

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

// Step 5: send push notification via ntfy.sh
async function sendNotification(message: string): Promise<void> {
  const response = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: "Weather Forecast",
    },
    body: message,
  });

  if (!response.ok) {
    throw new Error(`ntfy.sh error: ${response.status}`);
  }
}

// Main handler — EventBridge triggers this every morning
export const handler = async (): Promise<void> => {
  const point = await getNwsPoint();
  const weather = await getForecast(point);
  const advice = await getClothingAdvice(weather);
  const message = formatMessage(weather, advice);

  await sendNotification(message);

  console.log("Forecast sent:", message);
};
