#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { DailyNotificationBotStack } from "../lib/daily-notification-bot-stack";

const app = new cdk.App();
new DailyNotificationBotStack(app, "DailyNotificationBotStack");
