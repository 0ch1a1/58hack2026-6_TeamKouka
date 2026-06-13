import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { User } from '@supabase/supabase-js'
import { getErrorMessage, signIn, signUpRecipient } from '../features/auth'

type AuthScreenProps = {
  onSignedIn: (user: User) => void
}

export function AuthScreen({ onSignedIn }: AuthScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignUp() {
    setLoading(true)
    setMessage('')

    try {
      const user = await signUpRecipient({ email, password, fullName, phone })
      onSignedIn(user)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleSignIn() {
    setLoading(true)
    setMessage('')

    try {
      const session = await signIn(email, password)
      if (session?.user) onSignedIn(session.user)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>ShareKeep</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="email"
        style={styles.input}
        value={email}
      />
      <TextInput
        onChangeText={setPassword}
        placeholder="password"
        secureTextEntry
        style={styles.input}
        value={password}
      />
      <TextInput
        onChangeText={setFullName}
        placeholder="full name"
        style={styles.input}
        value={fullName}
      />
      <TextInput
        keyboardType="phone-pad"
        onChangeText={setPhone}
        placeholder="phone"
        style={styles.input}
        value={phone}
      />
      <View style={styles.row}>
        <Pressable disabled={loading} onPress={handleSignIn} style={styles.button}>
          <Text style={styles.buttonText}>Sign in</Text>
        </Pressable>
        <Pressable disabled={loading} onPress={handleSignUp} style={styles.button}>
          <Text style={styles.buttonText}>Sign up</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
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
  card: {
    gap: 12,
    padding: 20,
  },
  input: {
    borderColor: '#cbd5d1',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    color: '#9b2c2c',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  title: {
    color: '#17352d',
    fontSize: 28,
    fontWeight: '800',
  },
})
