import axios, { AxiosInstance } from "axios";

interface NtfyConfig {
  ntfyTopic: string;
  messageTitle: string;
}

export class NtfyClient {
  private axiosInstanceNtfy: AxiosInstance;

  constructor(config: NtfyConfig) {
    this.axiosInstanceNtfy = axios.create({
      baseURL: `https://ntfy.sh/${config.ntfyTopic}`,
      headers: { Title: config.messageTitle },
    });
  }

  async sendPushNotification(message: string): Promise<void> {
    try {
      await this.axiosInstanceNtfy.request({ method: "POST", data: message });
    } catch (error) {
      throw new Error(
        `Failed to send push notification: ${JSON.stringify(error)}`,
      );
    }
  }
}
