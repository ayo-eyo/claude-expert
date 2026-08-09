export default {
  'apps/backend/**/*.ts': [
    'eslint --config apps/backend/eslint.config.mjs --fix',
    () => 'npm run typecheck -w backend',
  ],
  'apps/frontend/**/*.{js,jsx,ts,tsx}': [
    'eslint --config apps/frontend/eslint.config.mjs --fix',
    () => 'npm run typecheck -w frontend',
  ],
  '**/*.{js,jsx,ts,tsx,json,md,css,scss,yml,yaml}': ['prettier --write --ignore-unknown'],
};
