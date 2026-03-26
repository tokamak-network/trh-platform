import { readFileSync } from 'fs';
import { join } from 'path';
import { PresetsFixtureSchema, type PresetsFixture } from '../schemas/preset.schema';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export function loadPresets(): PresetsFixture {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, 'presets.json'), 'utf-8'));
  return PresetsFixtureSchema.parse(raw);
}
