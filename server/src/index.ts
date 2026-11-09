import { createApp } from './app.ts';
import { config } from './config.ts';

createApp().listen(config.port, () => {
  console.log(`Peti listening on http://localhost:${config.port}`);
  if (config.demoMode) console.log('Demo mode is on: sign-in codes are shown on screen.');
  if (!config.anthropicApiKey) console.log('No ANTHROPIC_API_KEY: order capture will use the built-in matcher.');
});
