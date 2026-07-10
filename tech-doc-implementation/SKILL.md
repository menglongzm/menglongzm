---
name: tech-doc-implementation
description: Strictly implement project code from a technical document. Use whenever the user asks to implement, refactor, extend, or modify code according to a technical document, design doc, requirements spec, API spec, architecture doc, product doc, or implementation plan. Before each implementation unit, evaluate whether the document's requirement is compatible with the current project, reasonable, and unambiguous; ask the user before coding if there is conflict, ambiguity, missing context, or risky impact.
---

# Skill: tech-doc-implementation

Use this skill when the user wants code implemented according to a technical document or specification.

The goal is not merely to write code, but to ensure each implementation decision is compatible with the existing project and faithful to the document.

## Core principles

1. Treat the technical document as the primary source of requirements.
2. Treat the existing project as the source of architectural, stylistic, and compatibility constraints.
3. Do not invent requirements, change public behavior, add unrelated features, or perform opportunistic refactors.
4. Before implementing each meaningful unit, evaluate compatibility, correctness, reasonableness, and ambiguity.
5. If the document and project conflict, or the requirement is unclear, ask the user before coding.

## When to pause and ask

Pause implementation and ask the user when any of the following is true:

- The technical document is ambiguous, incomplete, or internally inconsistent.
- The document conflicts with existing project architecture, APIs, data models, dependencies, or behavior.
- Multiple implementation approaches are plausible and the document does not indicate a preferred one.
- The change may affect existing public interfaces, persisted data, permissions, authentication, billing, security, or compatibility.
- A new dependency, migration, breaking change, or architectural adjustment appears necessary.
- The existing project lacks required context or foundation for the documented requirement.
- The documented requirement appears unreasonable, unsafe, or inconsistent with the rest of the system.

Do not silently choose a risky interpretation.

## Workflow

### 1. Understand the document

Read the provided technical document and extract:

- Functional goals
- Required modules, APIs, components, data structures, flows, and edge cases
- Non-functional constraints, such as performance, compatibility, security, or dependency limits
- Explicit implementation requirements
- Open questions or possible ambiguities

If the document is not available or insufficient, ask for it.

### 2. Inspect the current project

Before coding, inspect the relevant project files to understand:

- Tech stack and framework conventions
- Directory structure
- Existing related modules
- Existing types, interfaces, utilities, services, hooks, components, tests, and configuration
- Naming, error handling, validation, logging, and testing patterns

Prefer reusing existing patterns over introducing new ones.

### 3. Split the work into implementation units

Break the document into small implementation units, such as:

- API endpoint
- service method
- data model
- UI component
- state management change
- configuration change
- validation rule
- test case

Do not make broad unrelated changes in one step.

### 4. Evaluate before each unit

Before implementing each unit, briefly assess:

```text
Implementation unit:
- Document requirement:
- Existing project context:
- Proposed approach:
- Compatibility:
- Correctness and maintainability:
- Risks or ambiguity:
- Decision:
```

If there are no blocking issues, proceed with implementation.

If there are blocking issues, ask the user a focused question and wait.

### 5. Implement strictly

When implementing:

- Follow the document exactly.
- Match surrounding code style, naming, structure, abstraction level, and comment density.
- Reuse existing utilities, types, services, and conventions.
- Avoid unrelated refactors.
- Avoid unnecessary dependencies.
- Keep changes focused and reviewable.
- Update tests when the project has relevant test patterns.
- Do not claim behavior is implemented unless the code actually does it.

### 6. Validate

After implementation, run the most relevant available checks, such as:

- Unit tests
- Type checking
- Linting
- Build
- Existing project-specific validation commands

If commands are unavailable or cannot be run, say so clearly.

If validation fails, report the failure honestly with the relevant output or summary.

### 7. Final report

End with a concise implementation summary:

```text
Summary:
- Implemented:
- Modified files:
- Document requirements covered:
- Validation performed:
- Validation result:
- Known limitations or follow-up questions:
```

## Output style

Be concise but explicit.

Before coding, provide enough analysis to show that the technical document and current project have been compared.

During implementation, do not over-explain obvious code changes.

When asking questions, ask only what is necessary to unblock a correct implementation.
