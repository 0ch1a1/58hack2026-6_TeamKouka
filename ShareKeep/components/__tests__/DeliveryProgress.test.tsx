import { render } from '@testing-library/react-native';
import {
  DeliveryProgress,
  estimateRemainingMinutes,
  normalizeTrackingProgress,
} from '../DeliveryProgress';

describe('DeliveryProgress', () => {
  it('renders estimated remaining minutes', () => {
    const { getByText } = render(<DeliveryProgress progress={40} />);
    expect(getByText('代理人が近づいています')).toBeTruthy();
    expect(getByText('あと約6分')).toBeTruthy();
    expect(getByText('40%')).toBeTruthy();
  });

  it('renders arrival state at 100 percent', () => {
    const { getByText } = render(<DeliveryProgress progress={100} />);
    expect(getByText('代理人が到着しました')).toBeTruthy();
    expect(getByText('到着しました')).toBeTruthy();
    expect(getByText('100%')).toBeTruthy();
  });
});

describe('tracking progress helpers', () => {
  it('clamps progress to 0..100', () => {
    expect(normalizeTrackingProgress(-10)).toBe(0);
    expect(normalizeTrackingProgress(51.4)).toBe(51);
    expect(normalizeTrackingProgress(150)).toBe(100);
  });

  it('estimates zero minutes only after arrival', () => {
    expect(estimateRemainingMinutes(0)).toBe(10);
    expect(estimateRemainingMinutes(95)).toBe(1);
    expect(estimateRemainingMinutes(100)).toBe(0);
  });
});
