# @repo-knowledge/verification-runtime

This package will own `board verify` for local runs.

## What it should do in this phase

- look at the repo contract and the current git changes
- figure out which checks should run
- run the checks safely
- keep a local record of each verification run
- print a short human summary and a stable JSON result

## What it should not do yet

- LLM-based reasoning
- hosted sync
- GitHub PR automation
- agent orchestration
- repo graph analysis beyond the basic matching rules in the contract
