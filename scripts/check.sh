#!/bin/bash
set -e

echo "Running TypeScript check..."
npx tsc --noEmit

echo "Running ESLint..."
npx eslint src/

echo "Building main package..."
npm run build

echo "Building Storybook..."
npm run build-storybook

echo "All checks passed!"
