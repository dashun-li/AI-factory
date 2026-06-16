import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowController } from './workflow.controller';
import { WorkflowGateway } from './workflow.gateway';
import { TrendController } from './trend.controller';
import { ScriptController } from './script.controller';
import { AnalysisController } from './analysis.controller';
import { ContentController } from './content.controller';
import { MediaController } from './media.controller';
import { SubtitleController } from './subtitle.controller';
import { RenderController } from './render.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue(
      { name: 'workflow' },
      { name: 'render' },
    ),
  ],
  controllers: [
    WorkflowController,
    TrendController,
    ScriptController,
    AnalysisController,
    ContentController,
    MediaController,
    SubtitleController,
    RenderController,
  ],
  providers: [WorkflowGateway],
})
export class AppModule {}
