const NUMBERED_STEP_PATTERN = /^\d+[.)]\s+(.+)$/;

export function parseNumberedInstructionLine(line: string) {
  const trimmed = line.trim();
  const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
  if (numbered) {
    return {
      number: Number(numbered[1]),
      text: numbered[2].trim(),
    };
  }

  return {
    number: null as number | null,
    text: trimmed,
  };
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function stepTextFromSegment(segment: string) {
  const trimmed = segment.trim();
  const numbered = trimmed.match(NUMBERED_STEP_PATTERN);
  if (numbered) {
    return numbered[1].trim();
  }

  const bulleted = trimmed.match(/^[-*•]\s+(.+)$/);
  if (bulleted) {
    return bulleted[1].trim();
  }

  return trimmed;
}

function isUsefulInstructionStep(step: string) {
  return /[A-Za-z]/.test(step);
}

function splitLineIntoSteps(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  const inlineParts = trimmed
    .split(/(?=\d+[.)]\s+)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (inlineParts.length > 1) {
    return inlineParts.map(stepTextFromSegment).filter(isUsefulInstructionStep);
  }

  return [stepTextFromSegment(trimmed)].filter(isUsefulInstructionStep);
}

function splitLineIntoStepCandidates(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  const inlineParts = trimmed
    .split(/(?=\d+[.)]\s+)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (inlineParts.length > 1) {
    return inlineParts.map(stepTextFromSegment);
  }

  return [stepTextFromSegment(trimmed)];
}

function parseInstructionSteps(instructions: string) {
  const lines = instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const steps = lines.flatMap(splitLineIntoSteps);

  if (steps.length === 1) {
    const sentences = splitIntoSentences(steps[0]);
    if (sentences.length > 1) {
      return sentences;
    }
  }

  return steps;
}

export function formatNumberedInstructions(instructions: string) {
  const steps = parseInstructionSteps(instructions.trim());
  if (steps.length === 0) {
    return '';
  }

  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
}

export function instructionsAreNumbered(instructions: string) {
  const trimmed = instructions.trim();
  if (!trimmed) {
    return true;
  }

  return formatNumberedInstructions(trimmed) === trimmed;
}

export function instructionsNeedFormatting(instructions: string) {
  const trimmed = instructions.trim();
  if (!trimmed) {
    return false;
  }

  return !instructionsAreNumbered(trimmed);
}

export function hasUnusableInstructionStep(instructions: string) {
  return instructions
    .split(/\r?\n/)
    .flatMap(splitLineIntoStepCandidates)
    .some((step) => !isUsefulInstructionStep(step));
}
