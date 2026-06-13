import { render } from '@testing-library/react-native';
import { InfoRow } from '../InfoRow';

describe('InfoRow', () => {
  it('renders the label and value', () => {
    const { getByText } = render(<InfoRow label="氏名" value="山田太郎" />);
    expect(getByText('氏名')).toBeTruthy();
    expect(getByText('山田太郎')).toBeTruthy();
  });

  it('renders an empty value without crashing', () => {
    const { getByText } = render(<InfoRow label="メモ" value="" />);
    expect(getByText('メモ')).toBeTruthy();
  });
});
