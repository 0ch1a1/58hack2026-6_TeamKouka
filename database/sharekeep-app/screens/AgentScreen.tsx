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
import * as Location from 'expo-location'
import { getErrorMessage } from '../features/auth'
import {
  AppNotification,
  fetchMyNotifications,
  findNearbyAgents,
  geocodeAgentAddress,
  upsertAgentProfile,
} from '../features/parcels'

type AgentScreenProps = {
  user: User
}

export function AgentScreen({ user }: AgentScreenProps) {
  const [address, setAddress] = useState('Tokyo Station')
  const [addressDetail, setAddressDetail] = useState('')
  const [availableDays, setAvailableDays] = useState('mon,tue,wed,thu,fri,sat,sun')
  const [startTime, setStartTime] = useState('00:00')
  const [endTime, setEndTime] = useState('23:59')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [radiusMeters, setRadiusMeters] = useState('50')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)

  function getAvailableDays() {
    return availableDays
      .split(',')
      .map((day) => day.trim().toLowerCase())
      .filter(Boolean)
  }

  async function getCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync()

    if (status !== Location.PermissionStatus.GRANTED) {
      throw new Error('Location permission was denied')
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })

    setLatitude(current.coords.latitude)
    setLongitude(current.coords.longitude)

    return current.coords
  }

  async function handleSaveProfileByAddress() {
    setGeocoding(true)
    setResult('')

    try {
      const data = await geocodeAgentAddress({
        userId: user.id,
        address,
        addressDetail,
        availableDays: getAvailableDays(),
        startTime,
        endTime,
      })

      if (data.latitude !== undefined && data.longitude !== undefined) {
        setLatitude(data.latitude)
        setLongitude(data.longitude)
      }

      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(getErrorMessage(error))
    } finally {
      setGeocoding(false)
    }
  }

  async function handleSaveProfileWithCurrentLocation() {
    setSaving(true)
    setResult('')

    try {
      const current = await getCurrentLocation()
      const data = await upsertAgentProfile({
        userId: user.id,
        address,
        addressDetail,
        latitude: current.latitude,
        longitude: current.longitude,
        availableDays: getAvailableDays(),
        startTime,
        endTime,
      })

      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleSearch() {
    setLoading(true)
    setResult('')

    try {
      const current = await getCurrentLocation()
      const data = await findNearbyAgents({
        latitude: current.latitude,
        longitude: current.longitude,
        radiusMeters: Number(radiusMeters || 50),
      })
      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function loadNotifications() {
    setLoadingNotifications(true)

    try {
      setNotifications(await fetchMyNotifications())
    } catch (error) {
      setResult(getErrorMessage(error))
    } finally {
      setLoadingNotifications(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Nearby agents</Text>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>My agent profile</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setAddress}
          placeholder="address for map search"
          style={styles.input}
          value={address}
        />
        <TextInput
          autoCapitalize="none"
          onChangeText={setAddressDetail}
          placeholder="building / room number"
          style={styles.input}
          value={addressDetail}
        />
        <Text style={styles.hint}>
          Use the main address for geocoding. Building and room number are saved
          and shown in search results.
        </Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setAvailableDays}
          placeholder="available days: mon,tue,wed"
          style={styles.input}
          value={availableDays}
        />
        <View style={styles.row}>
          <TextInput
            onChangeText={setStartTime}
            placeholder="start"
            style={[styles.input, styles.timeInput]}
            value={startTime}
          />
          <TextInput
            onChangeText={setEndTime}
            placeholder="end"
            style={[styles.input, styles.timeInput]}
            value={endTime}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Location</Text>
        <Text style={styles.hint}>
          Saved/current: {latitude?.toFixed(6) ?? '-'}, {longitude?.toFixed(6) ?? '-'}
        </Text>
      </View>

      <TextInput
        keyboardType="number-pad"
        onChangeText={setRadiusMeters}
        placeholder="radius meters"
        style={styles.input}
        value={radiusMeters}
      />

      <Pressable
        disabled={geocoding || !address}
        onPress={handleSaveProfileByAddress}
        style={[styles.secondaryButton, (geocoding || !address) && styles.disabled]}
      >
        <Text style={styles.secondaryButtonText}>Save profile from address</Text>
      </Pressable>

      <Pressable
        disabled={saving || !address}
        onPress={handleSaveProfileWithCurrentLocation}
        style={[styles.secondaryButton, (saving || !address) && styles.disabled]}
      >
        <Text style={styles.secondaryButtonText}>Save profile with current location</Text>
      </Pressable>

      <Pressable
        disabled={loading}
        onPress={handleSearch}
        style={[styles.button, loading && styles.disabled]}
      >
        <Text style={styles.buttonText}>Search near me</Text>
      </Pressable>

      <View style={styles.panel}>
        <View style={styles.row}>
          <Text style={[styles.sectionTitle, styles.flexTitle]}>My notifications</Text>
          <Pressable
            disabled={loadingNotifications}
            onPress={loadNotifications}
            style={styles.smallButton}
          >
            <Text style={styles.secondaryButtonText}>Refresh</Text>
          </Pressable>
        </View>
        {notifications.map((notification) => (
          <View key={notification.id} style={styles.notificationItem}>
            <Text style={styles.notificationTitle}>{notification.title}</Text>
            <Text style={styles.notificationBody}>{notification.body}</Text>
            <Text style={styles.hint}>
              parcel: {notification.parcel_id ?? '-'} / {notification.notification_type}
            </Text>
          </View>
        ))}
        {notifications.length === 0 ? (
          <Text style={styles.hint}>No notifications yet.</Text>
        ) : null}
      </View>

      {loading || saving || geocoding || loadingNotifications ? <ActivityIndicator /> : null}
      {result ? <Text selectable style={styles.result}>{result}</Text> : null}
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
  content: {
    gap: 12,
    padding: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  flexTitle: {
    flex: 1,
  },
  heading: {
    color: '#17352d',
    fontSize: 22,
    fontWeight: '800',
  },
  hint: {
    color: '#6b7d77',
    fontSize: 12,
  },
  input: {
    borderColor: '#cbd5d1',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  panel: {
    gap: 10,
  },
  notificationBody: {
    color: '#4b635b',
  },
  notificationItem: {
    backgroundColor: '#f7faf8',
    borderColor: '#dce8e2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  notificationTitle: {
    color: '#17352d',
    fontWeight: '800',
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
  sectionTitle: {
    color: '#17352d',
    fontSize: 16,
    fontWeight: '800',
  },
  smallButton: {
    alignItems: 'center',
    borderColor: '#1f6f5b',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  timeInput: {
    flex: 1,
  },
})
