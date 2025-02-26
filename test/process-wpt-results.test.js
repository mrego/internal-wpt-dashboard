/* eslint-env mocha */

import {
    merge_nonoverlap,
    score_run,
    process_raw_results,
    focus_areas_map
} from '../process-wpt-results.js'
import { strict as assert } from 'assert'

describe('merge_nonoverlap', () => {
    it('merges simple objects', () => {
        const obj1 = {
            foo: 'bar',
            id: 1
        }
        const obj2 = {
            key: 'value'
        }

        assert.deepEqual(merge_nonoverlap(obj1, obj2), {
            foo: 'bar',
            id: 1,
            key: 'value'
        })
    })
    it('merges nested objects', () => {
        const obj1 = {
            foo: 'bar',
            id: 1,
            sub1: {
                sub11: 10,
                sub13: {
                    k: 1
                }
            }
        }
        const obj2 = {
            key: 'value',
            sub1: {
                sub12: 20,
                sub13: {
                    v: 2
                }
            }
        }

        assert.deepEqual(merge_nonoverlap(obj1, obj2), {
            foo: 'bar',
            id: 1,
            key: 'value',
            sub1: {
                sub11: 10,
                sub12: 20,
                sub13: {
                    k: 1,
                    v: 2
                }
            }
        })
    })
    it('must obey identity rule', () => {
        let result = merge_nonoverlap({}, { a: { x: {} } })
        assert.deepEqual(result, { a: { x: {} } })
        result = merge_nonoverlap({ a: { x: {} } }, {})
        assert.deepEqual(result, { a: { x: {} } })
    })

    it('doesnt merge objects with arrays', () => {
        try {
            merge_nonoverlap({ a: { x: [] } }, {})
            throw new Error()
        } catch (e) {
            assert.equal(e.toString(),
                "AssertionError [ERR_ASSERTION]: Key x - arrays can't be merged")
        }
    })
    it('doesnt merge objects with arrays 2', () => {
        try {
            merge_nonoverlap({}, { a: { x: [] } })
            throw new Error()
        } catch (e) {
            assert.equal(e.toString(),
                "AssertionError [ERR_ASSERTION]: Key x - arrays can't be merged")
        }
    })
    it('doesnt merge objects with overlapping keys', () => {
        try {
            merge_nonoverlap({ a: { x: 1 } }, { a: { x: 2 } })
            throw new Error()
        } catch (e) {
            assert.equal(e.toString(),
                'AssertionError [ERR_ASSERTION]: Key x overlaps')
        }
    })
})

describe('Process wpt result', () => {
    it('correctly transforms simple wpt results', () => {
        const raw_result = {
            run_info: {
                product: 'servo',
                revision: 'commitSha',
                os: 'Ubuntu'
            },
            results: [
                {
                    test: 'test1',
                    status: 'PASS',
                    subtests: []
                },
                {
                    test: 'test2',
                    status: 'ERROR',
                    subtests: [
                        {
                            name: 'subtest1',
                            status: 'PASS'
                        },
                        {
                            name: 'subtest2',
                            status: 'FAIL'
                        }
                    ]
                }
            ]
        }

        const processed = process_raw_results(raw_result)
        assert.deepEqual(processed, {
            run_info: raw_result.run_info,
            test_scores: {
                test1: {
                    score: 1,
                    subtests: {}
                },
                test2: {
                    score: 0,
                    subtests: {
                        subtest1: { score: 1 },
                        subtest2: { score: 0 }
                    }
                }
            }
        })
    })
})

describe('Scoring', () => {
    it('calculates scores for individual tests', () => {
        const run = {
            test_scores: {
                test1: {
                    score: 1,
                    subtests: {}
                },
                test2: {
                    score: 1,
                    subtests: {}
                }
            }
        }

        const focus_area_map = {
            test1: ['all'],
            test2: ['all']
        }
        let score = score_run(run, run, focus_area_map)
        assert.deepEqual(score.all, 1000)

        run.test_scores.test2.score = 0
        score = score_run(run, run, focus_area_map)
        assert.deepEqual(score.all, 500)
    })
    it('calculates scores for subtests', () => {
        const run = {
            test_scores: {
                test1: {
                    score: 0,
                    subtests: {
                        subtest1: { score: 1 },
                        subtest2: { score: 1 },
                        subtest3: { score: 1 }
                    }
                }
            }
        }

        const score = score_run(run, run, { test1: ['all'] })
        assert.equal(score.all, 1000)
    })
    it('calculates scores for subtests by averaging', () => {
        const run = {
            test_scores: {
                test1: {
                    score: 0,
                    subtests: {
                        subtest1: { score: 1 },
                        subtest2: { score: 0 },
                        subtest3: { score: 0 }
                    }
                }
            }
        }

        const score = score_run(run, run, { test1: ['all'] })
        assert.equal(score.all, 333)
    })
    it('calculates scores based only on tests in new runs', () => {
        const old_run = {
            test_scores: {
                test1: { score: 1, subtests: {} },
                test3: { score: 0, subtests: {} }
            }
        }
        const new_run = {
            test_scores: {
                test2: { score: 1, subtests: {} },
                test3: { score: 1, subtests: {} }
            }
        }

        const all = ['all']
        const focus_map = {
            test1: all, test2: all, test3: all
        }
        let score = score_run(old_run, new_run, focus_map)
        assert.equal(score.all, 0)

        old_run.test_scores.test3.score = 1
        score = score_run(old_run, new_run, focus_map)
        assert.equal(score.all, 500)
    })
})

describe('focus areas', () => {
    it('correctly builds the focus area map for tests', () => {
        const run = {
            test_scores: {
                '/css/CSS2/floats-clear/float-replaced-width-004.xht': {
                    subtests: { sub1: {} }
                },
                '/css/CSS2/abspos/static-inside-table-cell.html': {
                    subtests: {}
                },
                '/css/CSS2/margin-padding-clear/margin-right-078.xht': {
                    subtests: { sub2: {} }
                },
                '/workers/semantics/multiple-workers/001.html': {
                    subtests: {}
                }
            }
        }
        const map = focus_areas_map(run)
        assert.deepEqual(map, {
            '/css/CSS2/floats-clear/float-replaced-width-004.xht': [
                'css2',
                'css',
                'all',
                'floats-clear'
            ],
            '/css/CSS2/abspos/static-inside-table-cell.html': [
                'css2',
                'css',
                'all',
                'abspos'
            ],
            '/css/CSS2/margin-padding-clear/margin-right-078.xht': [
                'css2',
                'css',
                'all',
                'margin-padding-clear'
            ],
            '/workers/semantics/multiple-workers/001.html': [
                'all'
            ]
        })
    })
})
