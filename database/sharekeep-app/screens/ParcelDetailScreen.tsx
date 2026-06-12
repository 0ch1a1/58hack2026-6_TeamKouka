import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { User } from '@supabase/supabase-js'
import { QrTokenView } from '../components/QrTokenView'
import {
  generateQrToken,
  Parcel,
  ParcelStatus,
  subscribeParcel,
  updateParcelStatus,
} from '../features/parcels'

const statuses: ParcelStatus[] = [
  'delivery_failed',
  'agent_assigned',
  'delivered_to_agent',
  'completed',
]

type ParcelDetailScreenProps = {
  parcel: Parcel
  user: User
  onBack: () => void
  onChanged: () => void
}

export function ParcelDetailScreen({
  parcel,
  user,
  onBack,
  onChanged,
}: ParcelDetailScreenProps) {
  const [qrToken, setQrToken] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleStatus(status: ParcelStatus) {
    setLoading(true)
    setMessage('')

    try {
      await updateParcelStatus(parcel.id, status)
      onChanged()
      setMessage(`Updated to ${status}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleQr(qrType: 'agent' | 'recipient') {
    setLoading(true)
    setMessage('')

    try {
      setQrToken(
        await generateQrToken({
          parcelId: parcel.id,
          userId: user.id,
          qrType,
        }),
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return subscribeParcel(parcel.id, onChanged)
  }, [parcel.id, onChanged])

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>

      <View style={styles.panel}>
        <Text style={styles.heading}>{parcel.tracking_no}</Text>
        <Text style={styles.small}>status: {parcel.status}</Text>
        <Text style={styles.small}>retry: {parcel.retry_count ?? 0}</Text>
        <Text style={styles.small}>co2: {parcel.co2_saved_kg ?? 0}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.wrap}>
          {statuses.map((status) => (
            <Pressable
              disabled={loading}
              key={status}
              onPress={() => handleStatus(status)}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{status}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>QR</Text>
        <View style={styles.row}>
          <Pressable disabled={loading} onPress={() => handleQr('agent')} style={styles.button}>
            <Text style={styles.buttonText}>Agent QR</Text>
          </Pressable>
          <Pressable disabled={loading} onPress={() => handleQr('recipient')} style={styles.button}>
            <Text style={styles.buttonText}>Recipient QR</Text>
          </Pressable>
        </View>
        {qrToken ? (
          <View style={styles.qrBox}>
            <QrTokenView token={qrToken} />
            <Text selectable style={styles.tokenText}>
              {qrToken}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? <ActivityIndicator /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    borderColor: '#1f6f5b',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#1f6f5b',
    fontWeight: '700',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#1f6f5b',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  chip: {
    backgroundColor: '#e9f4ef',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipText: {
    color: '#17352d',
    fontWeight: '700',
  },
  content: {
    gap: 14,
    padding: 16,
  },
  heading: {
    color: '#17352d',
    fontSize: 22,
    fontWeight: '800',
  },
  message: {
    color: '#9b2c2c',
  },
  panel: {
    gap: 10,
  },
  qrBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionTitle: {
    color: '#17352d',
    fontSize: 16,
    fontWeight: '800',
  },
  small: {
    color: '#4b635b',
  },
  tokenText: {
    color: '#4b635b',
    fontSize: 12,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
})
