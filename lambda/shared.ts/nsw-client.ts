import axios, { AxiosInstance } from "axios";

interface NwsConfig {
  latitude: string;
  longitude: string;
  userAgent: string;
}

interface NwsReport {
  forecastUrl: string;
  forecastHourlyUrl: string;
  city: string;
  state: string;
  timeZone: string;
  sunrise: string;
  sunset: string;
}

interface ForecastPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  probabilityOfPrecipitation: string;
  isDaytime: boolean;
}

export type HourlyForecastPeriod = Pick<
  ForecastPeriod,
  "temperature" | "temperatureUnit" | "windSpeed" | "shortForecast"
>;

export interface WeatherData {
  city: string;
  state: string;
  daytime: ForecastPeriod;
  nighttime: ForecastPeriod;
  sunrise: string;
  sunset: string;
  timeZone: string;
}

export class NwsClient {
  private nwsPointUrl: string;
  private headers: object;
  private axiosInstanceNws: AxiosInstance;
  private nwsReport: NwsReport;
  private timeZone: string;

  private constructor(config: NwsConfig) {
    this.nwsPointUrl = `https://api.weather.gov/points/${config.latitude},${config.longitude}`;
    this.headers = { "User-Agent": config.userAgent };
  }

  public static async create(config: NwsConfig): Promise<NwsClient> {
    const instance = new NwsClient(config);
    await instance.initialize();
    return instance;
  }

  async initialize(): Promise<void> {
    this.axiosInstanceNws = axios.create({ headers: this.headers });
    await this.setNwsPoint();
  }

  async setNwsPoint(): Promise<void> {
    try {
      const reponse: any = await this.axiosInstanceNws.request({
        method: "GET",
        url: this.nwsPointUrl,
      });
      const data = reponse.data;
      this.timeZone = data.properties.relativeLocation.timeZone;
      this.nwsReport = {
        forecastUrl: data.properties.forecast,
        forecastHourlyUrl: data.properties.forecastHourly,
        city: data.properties.relativeLocation.properties.city,
        state: data.properties.relativeLocation.properties.state,
        timeZone: this.timeZone,
        sunrise: this.convertToLocalTime(
          data.properties.astronomicalData.sunrise,
        ),
        sunset: this.convertToLocalTime(
          data.properties.astronomicalData.sunset,
        ),
      };
    } catch (error) {
      throw new Error(`NWS points API error: ${JSON.stringify(error)}`);
    }
  }

  async getMorningForecast(): Promise<WeatherData> {
    try {
      const point = this.nwsReport;
      const reponse: any = await this.axiosInstanceNws.request({
        method: "GET",
        url: point.forecastUrl,
      });
      const data = reponse.data;

      const periods = data.properties.periods;
      const daytime = periods.find((p: any) => p.isDaytime);
      const nighttime = periods.find((p: any) => !p.isDaytime);

      return {
        city: point.city,
        state: point.state,
        daytime: this.toPeriod(daytime),
        nighttime: this.toPeriod(nighttime),
        sunrise: point.sunrise,
        sunset: point.sunset,
        timeZone: point.timeZone,
      };
    } catch (error) {
      throw new Error(`NWS forecast API error: ${JSON.stringify(error)}`);
    }
  }

  async getHourlyForecast(): Promise<HourlyForecastPeriod> {
    try {
      const point = this.nwsReport;
      const reponse: any = await this.axiosInstanceNws.request({
        method: "GET",
        url: point.forecastHourlyUrl,
      });
      const periods = reponse.data.properties.periods;
      const currentHourPeriod = periods[0];
      return {
        temperature: currentHourPeriod.temperature,
        temperatureUnit: currentHourPeriod.temperatureUnit,
        windSpeed: currentHourPeriod.windSpeed,
        shortForecast: currentHourPeriod.shortForecast,
      };
    } catch (error) {
      throw new Error(`NWS hourlyForecast API error: ${JSON.stringify(error)}`);
    }
  }

  convertToLocalTime(date: string): string {
    return new Date(date).toLocaleString("en-US", { timeZone: this.timeZone });
  }

  toPeriod(p: any): ForecastPeriod {
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
}
