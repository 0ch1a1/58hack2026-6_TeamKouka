import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';
import { AuthLayout, AuthBackLink, AuthTextField, SignUpForm } from '../../components/auth';

export default function SignUpDriverScreen() {
  const [companyName, setCompanyName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  return (
    <AuthLayout centered={false}>
      <SignUpForm
        variant="driver"
        role="delivery_company"
        title="配達員登録"
        submitLabel="配達員として登録する"
        nameSectionLabel="基本情報"
        loginSectionLabel="ログイン情報"
        header={<AuthBackLink />}
        extraValid={!!companyName && !!employeeId}
        extraProfile={{ company_name: companyName, employee_id: employeeId }}
        extraFields={
          <>
            <Text style={styles.sectionLabel}>所属情報</Text>
            <AuthTextField
              placeholder="配送会社名（例：ヤマト運輸）"
              value={companyName}
              onChangeText={setCompanyName}
            />
            <AuthTextField
              placeholder="社員番号 / ドライバーID"
              value={employeeId}
              onChangeText={setEmployeeId}
              autoCapitalize="none"
            />
          </>
        }
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray,
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
