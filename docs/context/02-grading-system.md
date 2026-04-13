# Grading System Rules

## Grade Components

Every subject (except non-examinable ones) is graded across three components per term:

| Component                 | Column Codes              | Description                                   |
| ------------------------- | ------------------------- | --------------------------------------------- |
| Written Works (WW)        | W1, W2, W3 (up to W5)     | Worksheets, textbook work, homework, spelling |
| Performance Tasks (PT)    | PT1, PT2, PT3 (up to PT5) | Quizzes, topical tests, class participation   |
| Quarterly Assessment (QA) | Exam                      | End-of-term exam                              |

Each component has a **configurable number of items** (the max score) set per subject per section per term. These are not fixed — teachers may adjust the exam total (e.g., planned 30 items becomes 40 items on exam day). Any such change requires approval from Ms. Chandana/Ms. Tin before the registrar updates it.

## Grading Weights

Weights differ by subject level. Both are confirmed from the actual grading sheets:

### Primary — Math (and most Primary subjects)

| Component            | Weight  |
| -------------------- | ------- |
| Written Works        | **40%** |
| Performance Tasks    | **40%** |
| Quarterly Assessment | **20%** |

### Secondary — Contemporary Arts (and most Secondary subjects)

| Component            | Weight  |
| -------------------- | ------- |
| Written Works        | **30%** |
| Performance Tasks    | **50%** |
| Quarterly Assessment | **20%** |

> **Important:** Weights are stored per subject configuration, not hardcoded. They are constant for the full school year but may change next AY. The system must allow admin configuration of weights per subject per AY.

## Grade Computation Formula

### Step 1 — Percentage Score (PS) per component

```
WW_PS  = (sum of W1..Wn) / WW_total_max × 100
PT_PS  = (sum of PT1..PTn) / PT_total_max × 100
QA_PS  = QA_score / QA_max × 100
```

### Step 2 — Weighted Score (WS) per component

```
WW_WS  = WW_PS  × WW_weight   (e.g., × 0.40 or × 0.30)
PT_WS  = PT_PS  × PT_weight   (e.g., × 0.40 or × 0.50)
QA_WS  = QA_PS  × QA_weight   (always × 0.20)
```

### Step 3 — Initial Grade

```
Initial Grade = WW_WS + PT_WS + QA_WS
```

### Step 4 — Quarterly Grade (Transmutation)

This is the DepEd transmutation formula. Confirmed from the actual Excel formula:

```
=IF(InitialGrade < 60,
    ROUNDDOWN(60 + (15 × InitialGrade / 60), 0),
    ROUNDDOWN(75 + (25 × (InitialGrade - 60) / 40), 0)
)
```

In Python:

```python
import math

def transmute(initial_grade: float) -> int:
    if initial_grade < 60:
        return math.floor(60 + (15 * initial_grade / 60))
    else:
        return math.floor(75 + (25 * (initial_grade - 60) / 40))
```

## Overall Grade (Annual)

From the Masterfile formula — terms are weighted unequally:

```
Overall = ROUND((T1 × 0.20) + (T2 × 0.20) + (T3 × 0.20) + (T4 × 0.40), 2)
```

Term 4 carries double weight (40%). Terms 1–3 each carry 20%.

## Grading Scale

### Examinable Subjects (numeric)

| Descriptor                 | Range    |
| -------------------------- | -------- |
| Outstanding                | 90–100   |
| Very Satisfactory          | 85–89    |
| Satisfactory               | 80–84    |
| Fairly Satisfactory        | 75–79    |
| Below Minimum Expectations | Below 75 |

### Non-Examinable Subjects (letter)

| Code | Meaning                                | Range        |
| ---- | -------------------------------------- | ------------ |
| A    | Fully demonstrated the skills required | 90–100       |
| B    | Demonstrated some skills required      | 85–89        |
| C    | Fairly demonstrated the skill required | 80–84        |
| IP   | In Progress                            | 79 and below |
| UG   | Ungraded                               | —            |
| NA   | Not Applicable                         | —            |
| INC  | Incomplete                             | —            |
| CO   | Complete                               | —            |
| E    | Exempted                               | —            |

## Score Entry Rules

- Blank cell = student did not take the assessment (excluded from computation)
- Zero (0) = student took the assessment and scored zero
- These are distinct and must be handled differently in the system
- WW and PT column counts vary per level and subject — configured per grading sheet
- The number of active columns is determined by the length of ww_totals and pt_totals arrays
- Maximum possible: 5 WW, 5 PT — but most sheets use 2–4
- QA is always 1 column
- Max students per section: **50**

## Late Enrollee Handling

If a student enrolled after some assessments were already given:

- Assessments taken before enrollment date are left blank (not zero)
- Proration is handled manually by the registrar (Joann)
- If a student has zero Written Works entries at all, the case is escalated to Ms. Chandana to decide treatment
- The system must flag late enrollees and allow the registrar to mark specific assessments as "not applicable" rather than zero

## Non-Examinable Subjects

Some subjects are graded with letter codes (A/B/C/IP/UG) instead of numeric scores:

- **Primary:** Christian Living
- **Secondary:** Pastoral Ministry and Personal Development, Co-curricular Activities (CCA)

These subjects do not use the WW/PT/QA formula. Teachers enter a letter grade directly.

## Term-over-Term Comparison

The grading sheets show the previous term's grade alongside the current term. If the difference exceeds a configurable threshold (positive or negative), the cell is highlighted for teacher deliberation. The system should support this comparison view.
