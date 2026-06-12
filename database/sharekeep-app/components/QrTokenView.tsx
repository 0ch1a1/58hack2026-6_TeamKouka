import QRCode from 'react-native-qrcode-svg'

export function QrTokenView({ token }: { token: string }) {
  return <QRCode value={token} size={220} />
}
