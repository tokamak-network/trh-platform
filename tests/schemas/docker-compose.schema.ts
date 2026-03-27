// @vitest-environment node
import { z } from 'zod';

const HealthcheckSchema = z.object({
  test: z.union([z.string(), z.array(z.string())]).optional(),
  interval: z.string().optional(),
  timeout: z.string().optional(),
  retries: z.number().optional(),
  start_period: z.string().optional(),
});

const DependsOnSchema = z.union([
  z.array(z.string()),
  z.record(
    z.string(),
    z.object({
      condition: z.string(),
    }),
  ),
]);

const ServiceSchema = z.object({
  image: z.string().optional(),
  container_name: z.string().optional(),
  ports: z.array(z.string()).optional(),
  environment: z.union([z.record(z.string(), z.union([z.string(), z.number()])), z.array(z.string())]).optional(),
  env_file: z.union([z.string(), z.array(z.string())]).optional(),
  depends_on: DependsOnSchema.optional(),
  volumes: z.array(z.string()).optional(),
  healthcheck: HealthcheckSchema.optional(),
  restart: z.string().optional(),
  networks: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
});

const VolumeSchema = z.union([
  z.null(),
  z.object({
    name: z.string().optional(),
    external: z.boolean().optional(),
    driver: z.string().optional(),
  }),
]);

export const DockerComposeSchema = z.object({
  version: z.string().optional(),
  services: z.record(z.string(), ServiceSchema),
  volumes: z.record(z.string(), VolumeSchema.nullable()).optional(),
  networks: z.record(z.string(), z.unknown()).optional(),
});

export type DockerCompose = z.infer<typeof DockerComposeSchema>;
export type Service = z.infer<typeof ServiceSchema>;
export { ServiceSchema };
