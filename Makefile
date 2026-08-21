.PHONY: check validate selftest

## check: run every quality gate (what CI runs)
check: validate selftest

## validate: validate all SKILL.md files, evals, and plugin manifests
validate:
	python3 scripts/validate_skills.py

## selftest: run the skills' own runnable checks (no browser, no network)
selftest:
	@node skills/walkthrough-record/scripts/frame.mjs --self-test
