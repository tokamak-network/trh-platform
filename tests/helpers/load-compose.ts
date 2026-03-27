import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { DockerComposeSchema, type DockerCompose } from '../schemas/docker-compose.schema';

const DEFAULT_COMPOSE_PATH = join(__dirname, '..', '..', 'resources', 'docker-compose.yml');

export function loadCompose(filePath: string = DEFAULT_COMPOSE_PATH): DockerCompose {
  const raw = yaml.load(readFileSync(filePath, 'utf-8'));
  return DockerComposeSchema.parse(raw);
}
