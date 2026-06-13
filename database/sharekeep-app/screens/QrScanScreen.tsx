import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { verifyAgentQr, verifyRecipientQr } from '../features/parcels'

type VerifyMode = 'agent' | 'recipient'

export function QrScanScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [mode, setMode] = useState<VerifyMode>('agent')
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanned, setScanned] = useState(false)

  async function verifyToken(value: string) {
    if (!value) return

    setLoading(true)
    setMessage('')

    try {
      const result = mode === 'agent' ? await verifyAgentQr(value) : await verifyRecipientQr(value)
      setMessage(JSON.stringify(result, null, 2))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>QR verify</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => setMode('agent')}
          style={[styles.modeButton, mode === 'agent' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeText, mode === 'agent' && styles.modeTextActive]}>Agent</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('recipient')}
          style={[styles.modeButton, mode === 'recipient' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeText, mode === 'recipient' && styles.modeTextActive]}>
            Recipient
          </Text>
        </Pressable>
      </View>

      {permission?.granted ? (
        <View style={styles.cameraFrame}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              scanned
                ? undefined
                : ({ data }) => {
                    setScanned(true)
                    setToken(data)
                    verifyToken(data)
                  }
            }
            style={styles.camera}
          />
        </View>
      ) : (
        <Pressable onPress={requestPermission} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Enable camera</Text>
        </Pressable>
      )}

      {scanned ? (
        <Pressable onPress={() => setScanned(false)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Scan again</Text>
        </Pressable>
      ) : null}

      <TextInput
        autoCapitalize="none"
        onChangeText={setToken}
        placeholder="token"
        style={styles.input}
        value={token}
      />
      <Pressable
        disabled={loading || !token}
        onPress={() => verifyToken(token)}
        style={[styles.button, (loading || !token) && styles.disabled]}
      >
        <Text style={styles.buttonText}>Verify</Text>
      </Pressable>
      {loading ? <ActivityIndicator /> : null}
      {message ? <Text selectable style={styles.result}>{message}</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#1f6f5b',
    borderRadius: 8,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  camera: {
    height: 240,
  },
  cameraFrame: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  content: {
    gap: 12,
    padding: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  heading: {
    color: '#17352d',
    fontSize: 22,
    fontWeight: '800',
  },
  input: {
    borderColor: '#cbd5d1',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modeButton: {
    alignItems: 'center',
    borderColor: '#1f6f5b',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#1f6f5b',
  },
  modeText: {
    color: '#1f6f5b',
    fontWeight: '700',
  },
  modeTextActive: {
    color: '#fff',
  },
  result: {
    backgroundColor: '#f7faf8',
    borderRadius: 8,
    color: '#17352d',
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#1f6f5b',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#1f6f5b',
    fontWeight: '700',
  },
})
