# simple-coverage-check

Compares lines coverage versus the PR base (`coverage-summary.json` or `lcov.info`) and warns when the drop exceeds a budget.

## Usage

```yaml
- uses: actions/checkout@v4
- run: npm test -- --coverage
- uses: dmytropaduchak/simple-coverage-check@v0.1.0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    coverage-path: coverage/coverage-summary.json
    max-drop: "1"
```

## Develop

```bash
npm install && npm run build
```
