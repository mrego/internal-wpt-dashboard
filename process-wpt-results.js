import assert from 'node:assert/strict'

function is_object (val) {
    return (
        typeof val === 'object' && val !== null && val !== undefined
    )
}

export function merge_nonoverlap (obj1, obj2) {
    function checkNoArray (obj) {
        for (const [k, v] of Object.entries(obj)) {
            assert(!Array.isArray(v), `Key ${k} - arrays can't be merged`)
            if (is_object(v)) {
                checkNoArray(v)
            }
        }
        return obj
    }

    checkNoArray(obj1)
    const result = obj1
    for (const [k, v] of Object.entries(obj2)) {
        if (is_object(v)) {
            if (result[k] === undefined) {
                result[k] = checkNoArray(v)
            } else {
                assert(is_object(result[k]), `Key ${k} is not an object`)
                result[k] = merge_nonoverlap(obj1[k], v)
            }
        } else {
            assert(!Array.isArray(v), `Key ${k} - arrays can't be merged`)
            assert(!(k in obj1), `Key ${k} overlaps`)
            result[k] = v
        }
    }
    return result
}

export function process_raw_results (raw_results) {
    const test_scores = {}
    const run_info = raw_results.run_info

    for (const test of raw_results.results) {
        const test_name = test.test
        const test_status = test.status

        const test_score = {
            score: test_status === 'PASS' ? 1 : 0,
            subtests: {}
        }

        test_scores[test_name] = test_score

        for (const subtest of test.subtests) {
            test_score.subtests[subtest.name] = {
                score: subtest.status === 'PASS' ? 1 : 0
            }
        }
    }

    return { run_info, test_scores }
}

export function focus_areas_map (run) {
    const map = {}
    for (const test of Object.keys(run.test_scores)) {
        map[test] = []
        for (const [area_key, area] of Object.entries(FOCUS_AREAS)) {
            if (area.predicate(test)) {
                map[test].push(area_key)
            }
        }
    }
    return map
}

function regex_predicate (exp) {
    return test_name => exp.test(test_name)
}

function prefix_predicate (prefix) {
    return test_name => test_name.startsWith(prefix)
}

const CSS2_FOCUS_FOLDERS = [
    'abspos',
    'box-display',
    'floats',
    'floats-clear',
    'linebox',
    'margin-padding-clear',
    'normal-flow',
    'positioning'
]

const CSS2_FOCUS_REGEXP = new RegExp(
    `^/css/CSS2/(${CSS2_FOCUS_FOLDERS.join('|')})/`
)

const FOCUS_AREAS = {
    css2: {
        name: 'CSS2 focus folders',
        predicate: regex_predicate(CSS2_FOCUS_REGEXP),
        order: 0
    },
    cssom: {
        name: 'CSSOM',
        predicate: prefix_predicate('/css/cssom/'),
        order: 90
    },
    csspos: {
        name: 'CSS Position',
        predicate: prefix_predicate('/css/css-position/'),
        order: 91
    },
    cssflex: {
        name: 'CSS Flexbox',
        predicate: prefix_predicate('/css/css-flexbox/'),
        order: 92
    },
    css: {
        name: 'All CSS tests',
        predicate: prefix_predicate('/css/'),
        order: 98
    },
    all: {
        name: 'All WPT tests',
        predicate: prefix_predicate(''),
        order: 99
    }
}

for (const [idx, folder] of CSS2_FOCUS_FOLDERS.entries()) {
    const path = `/css/CSS2/${folder}/`
    FOCUS_AREAS[folder] = {
        name: `-- ${path}`,
        predicate: prefix_predicate(path),
        order: idx + 1
    }
}

export function get_focus_areas () {
    const area_keys = []
    const area_names = {}
    for (const [key, area] of Object.entries(FOCUS_AREAS)) {
        area_keys.push(key)
        area_names[key] = area.name
    }

    area_keys.sort((a, b) => FOCUS_AREAS[a].order - FOCUS_AREAS[b].order)
    return { area_keys, area_names }
}

export function score_run (run, against_run, focus_areas_map) {
    const scores = {}
    for (const area of Object.keys(FOCUS_AREAS)) {
        scores[area] = {
            total_tests: 0,
            total_score: 0
        }
    }

    for (const [test, { subtests }] of Object.entries(against_run.test_scores)) {
        const areas = focus_areas_map[test]

        for (const area of areas) {
            scores[area].total_tests += 1
        }

        const run_test = run.test_scores[test]

        // score new tests not present in older runs
        if (!run_test) continue

        const subtest_names = Object.keys(subtests)
        if (!subtest_names.length) {
            for (const area of areas) {
                scores[area].total_score += run_test.score
            }
        } else {
            let test_score = 0
            for (const subtest of subtest_names) {
                if (run_test.subtests[subtest]) {
                    test_score += run_test.subtests[subtest].score
                }
            }
            test_score /= subtest_names.length
            for (const area of areas) {
                scores[area].total_score += test_score
            }
        }
    }

    return Object.entries(scores).reduce((scores, [area, totals]) => {
        scores[area] = 0
        if (totals.total_tests !== 0) {
            scores[area] = Math.floor(
                1000 * totals.total_score / totals.total_tests
            )
        }
        return scores
    }, {})
}
