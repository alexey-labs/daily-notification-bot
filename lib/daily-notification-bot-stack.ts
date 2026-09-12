import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as path from "path";

export class DailyNotificationBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Configuration pass these at deploy time
    // 37.757318086962854, -122.46201596945924
    const latitude = this.node.tryGetContext("latitude");
    const longitude = this.node.tryGetContext("longitude");
    const ntfyTopic = this.node.tryGetContext("ntfyTopic");

    if (!latitude || !longitude || !ntfyTopic) {
      throw new Error(
        `Missing required context... Deploy with cdk deploy 
        --context latitude=10 --context longitude...`,
      );
    }

    // Lambda function - fetches weather, calls bedrock, sends notif via ntfy
    const fn = new NodejsFunction(this, "ForecaseFunction", {
      runtime: Runtime.NODEJS_24_X,
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "handler",
      environment: {
        LATITUDE: latitude,
        LONGITUDE: longitude,
        NTFY_TOPIC: ntfyTopic,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Grant lambda permission to invoke Bedrock
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0",
        ],
      }),
    );

    // EventBridge rule - triggers evey morning
    new events.Rule(this, "MorningSchedule", {
      schedule: events.Schedule.cron({
        minute: "30",
        hour: "13", // UTC - 6:30 am pacific time
        weekDay: "*",
      }),
      targets: [new eventTargets.LambdaFunction(fn)],
    });

    // Output the function name for manual testinqg
    new cdk.CfnOutput(this, "FunctionName", {
      value: fn.functionName,
      description: "Lambda function name for manual testing",
    });
  }
}
