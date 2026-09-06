export function toTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const JAPAN_UTC_OFFSET = 9 * 60 * 60 * 1000;

export function daysBetween(previous: number, current: number): number {
  const days = Math.round((current - previous) / DAY_IN_MILLISECONDS);
  return days > 0 ? days : 1;
}

export function calendarDaysFromPublishedAt(
  publishedAt: number,
  recordedAt: number,
): number {
  const publishedDay = Math.floor(
    (publishedAt + JAPAN_UTC_OFFSET) / DAY_IN_MILLISECONDS,
  );
  const recordedDay = Math.floor(
    (recordedAt + JAPAN_UTC_OFFSET) / DAY_IN_MILLISECONDS,
  );
  return recordedDay - publishedDay;
}

export function toDailyViewCounts(
  totals: readonly (number | null)[],
  timestamps: readonly number[],
): (number | null)[] {
  let previousIndex = -1;
  return totals.map((current, index) => {
    if (current === null) return null;
    if (previousIndex < 0) {
      previousIndex = index;
      return null;
    }

    const previous = totals[previousIndex];
    const daily = previous === null ? null : Math.round(
      (current - previous) /
        daysBetween(timestamps[previousIndex], timestamps[index]),
    );
    previousIndex = index;
    return daily;
  });
}

export function movingAverage(
  values: readonly (number | null)[],
  timestamps: readonly number[],
  windowDays: number,
): (number | null)[] {
  if (windowDays <= 1) return [...values];

  const result: (number | null)[] = [];
  let firstIndexInWindow = 0;
  let firstValidTimestamp: number | null = null;
  let firstValidValue = 0;
  let sum = 0;
  let sampleCount = 0;

  values.forEach((current, index) => {
    if (current !== null) {
      if (firstValidTimestamp === null) {
        firstValidTimestamp = timestamps[index];
        firstValidValue = current;
      }
      sum += current;
      sampleCount++;
    }

    const windowStart = timestamps[index] -
      (windowDays - 1) * DAY_IN_MILLISECONDS;
    while (
      firstIndexInWindow <= index &&
      timestamps[firstIndexInWindow] < windowStart
    ) {
      const expired = values[firstIndexInWindow];
      if (expired !== null) {
        sum -= expired;
        sampleCount--;
      }
      firstIndexInWindow++;
    }

    // 窓がまだ先頭をはみ出す期間は最初の観測値で補完する。
    // 初日を描画しつつ、先頭だけ平均期間が短くなる端点効果を防ぐ。
    const coveredDays = firstValidTimestamp === null ? 0 : Math.min(
      windowDays,
      Math.round(
        (timestamps[index] - firstValidTimestamp) / DAY_IN_MILLISECONDS,
      ) + 1,
    );
    const paddedDays = windowDays - coveredDays;
    const paddedSum = sum + firstValidValue * paddedDays;
    const paddedSampleCount = sampleCount + paddedDays;

    result.push(
      current === null || paddedSampleCount === 0
        ? null
        : Math.round(paddedSum / paddedSampleCount),
    );
  });

  return result;
}

export function smoothLogLog(
  values: readonly (number | null)[],
  xValues: readonly number[],
  span: number,
): (number | null)[] {
  if (span <= 1) return [...values];

  const result = Array<(number | null)>(values.length).fill(null);
  const validPoints = values.flatMap((value, index) => {
    const x = xValues[index];
    return value !== null && value > 0 && x > 0
      ? [{ index, x: Math.log(x), y: Math.log(value) }]
      : [];
  });
  if (validPoints.length < 2) return [...values];

  const neighborhoodSize = Math.min(
    validPoints.length,
    Math.max(3, Math.round(span)),
  );

  // 累積和により各近傍のlog-log局所線形回帰をO(1)で求める。
  const sumX = [0];
  const sumY = [0];
  const sumXX = [0];
  const sumXY = [0];
  validPoints.forEach((point, index) => {
    sumX.push(sumX[index] + point.x);
    sumY.push(sumY[index] + point.y);
    sumXX.push(sumXX[index] + point.x * point.x);
    sumXY.push(sumXY[index] + point.x * point.y);
  });

  validPoints.forEach((target, targetPosition) => {
    const centeredStart = targetPosition - Math.floor(neighborhoodSize / 2);
    const start = Math.max(
      0,
      Math.min(centeredStart, validPoints.length - neighborhoodSize),
    );
    const end = start + neighborhoodSize;
    const count = end - start;
    const localSumX = sumX[end] - sumX[start];
    const localSumY = sumY[end] - sumY[start];
    const localSumXX = sumXX[end] - sumXX[start];
    const localSumXY = sumXY[end] - sumXY[start];
    const determinant = count * localSumXX - localSumX * localSumX;
    const fittedLogValue = Math.abs(determinant) > Number.EPSILON
      ? ((localSumY * localSumXX - localSumX * localSumXY) +
        (count * localSumXY - localSumX * localSumY) * target.x) /
        determinant
      : localSumY / count;
    const fittedValue = Math.exp(fittedLogValue);
    result[target.index] = Number.isFinite(fittedValue)
      ? Math.round(fittedValue)
      : values[target.index];
  });

  return result;
}
