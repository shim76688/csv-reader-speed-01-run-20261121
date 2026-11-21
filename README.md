# csv-reader-speed-01

A faster drop-in for csv-reader 1.0.0: `solve.js` reads broken CSV files with
exactly csv-reader's answers (`{columns, rows, errors}`), in a fraction of
its CPU time. `main.ts` is the kit's driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

How it is fast: a clean record is taken whole with native `indexOf`/`split`;
any line holding a quote or a stray CR is read field by field with a tight
single-pass scanner that slices fields instead of building them up a
character at a time, and no result object is built per field.

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/shim76688/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/shim76688/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
