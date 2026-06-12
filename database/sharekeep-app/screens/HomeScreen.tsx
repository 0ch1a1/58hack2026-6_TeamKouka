import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { User } from '@supabase/supabase-js'
import { createParcel, fetchMyParcels, Parcel } from '../features/parcels'

type HomeScreenProps = {
  user: User
  onSelectParcel: (parcel: Parcel) => void
}

export function HomeScreen({ user, onSelectParcel }: HomeScreenProps) {
  const [deliveryCompanyId, setDeliveryCompanyId] = useState('')
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadParcels() {
    setLoading(true)
    setMessage('')

    try {
      setParcels(await fetchMyParcels(user.id))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateParcel() {
    setLoading(true)
    setMessage('')

    try {
      const parcel = await createParcel({
        recipientId: user.id,
        deliveryCompanyId,
      })
      setParcels((current) => [parcel, ...current])
      setDeliveryCompanyId('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadParcels()
  }, [])

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.heading}>Parcels</Text>
        <Text style={styles.small}>User: {user.email ?? user.id}</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setDeliveryCompanyId}
          placeholder="delivery_company_id"
          style={styles.input}
          value={deliveryCompanyId}
        />
        <View style={styles.row}>
          <Pressable
            disabled={loading || !deliveryCompanyId}
            onPress={handleCreateParcel}
            style={[styles.button, (!deliveryCompanyId || loading) && styles.disabled]}
          >
            <Text style={styles.buttonText}>Create parcel</Text>
          </Pressable>
          <Pressable disabled={loading} onPress={loadParcels} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Refresh</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>

      {parcels.map((parcel) => (
        <Pressable key={parcel.id} onPress={() => onSelectParcel(parcel)} style={styles.item}>
          <Text style={styles.itemTitle}>{parcel.tracking_no}</Text>
          <Text style={styles.small}>status: {parcel.status}</Text>
          <Text style={styles.small}>co2: {parcel.co2_saved_kg ?? 0}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
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
  item: {
    backgroundColor: '#f7faf8',
    borderColor: '#dce8e2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  itemTitle: {
    color: '#17352d',
    fontSize: 18,
    fontWeight: '800',
  },
  message: {
    color: '#9b2c2c',
  },
  panel: {
    gap: 10,
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
    flex: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#1f6f5b',
    fontWeight: '700',
  },
  small: {
    color: '#4b635b',
  },
})
