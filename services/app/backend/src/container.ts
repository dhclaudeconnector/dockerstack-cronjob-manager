import type { AppConfig } from "./config/env.js";
import type { Logger } from "./logger.js";
import { createRtdb, type RtdbClient } from "./db/rtdb.js";
import { ResourceRepo } from "./lib/resourceRepo.js";
import { TaxonomyRepo } from "./lib/taxonomyRepo.js";
import { JobsService } from "./cronjob/jobsService.js";
import { HandlerRegistry } from "./executor/registry.js";
import { Runner, FnRegistry } from "./executor/runner.js";
import { QueueConsumer } from "./executor/queue.js";
import { TaskRepo } from "./lib/taskRepo.js";
import { AppLogRepo } from "./lib/appLog.js";
import { RESOURCE_TYPES, type ResourceUrlType } from "./types.js";

/** Dependency container built once at boot and shared across routes. */
export interface Container {
  config: AppConfig;
  logger: Logger;
  rtdb: RtdbClient;
  resources: Record<ResourceUrlType, ResourceRepo>;
  taxonomy: {
    tags: TaxonomyRepo;
    projects: TaxonomyRepo;
    collections: TaxonomyRepo;
  };
  jobs: JobsService;
  registry: HandlerRegistry;
  fnRegistry: FnRegistry;
  runner: Runner;
  queue: QueueConsumer;
  tasks: TaskRepo;
  appLog: AppLogRepo;
}

export function buildContainer(config: AppConfig, logger: Logger, rtdbOverride?: RtdbClient): Container {
  const rtdb = rtdbOverride ?? createRtdb(config);

  const resources = {} as Record<ResourceUrlType, ResourceRepo>;
  (Object.keys(RESOURCE_TYPES) as ResourceUrlType[]).forEach((k) => {
    const def = RESOURCE_TYPES[k];
    resources[k] = new ResourceRepo(rtdb, def.path, def.type, config);
  });

  const taxonomy = {
    tags: new TaxonomyRepo(rtdb, "tags"),
    projects: new TaxonomyRepo(rtdb, "projects"),
    collections: new TaxonomyRepo(rtdb, "collections"),
  };

  const jobs = new JobsService(rtdb, resources.accounts, resources["github-tokens"], config, logger);

  const registry = new HandlerRegistry({
    dir: config.exec.handlersDir,
    allowed: config.exec.allowed,
    logger,
  });
  const fnRegistry = new FnRegistry();
  const runner = new Runner(registry, fnRegistry, rtdb, config, logger);
  const queue = new QueueConsumer(rtdb, runner, config.rtdbExecQueuePath, logger);

  const tasks = new TaskRepo(rtdb);
  const appLog = new AppLogRepo(rtdb, logger);

  return { config, logger, rtdb, resources, taxonomy, jobs, registry, fnRegistry, runner, queue, tasks, appLog };
}
