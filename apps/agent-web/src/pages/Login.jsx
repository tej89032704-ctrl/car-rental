import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import AuthPage from '../../../../packages/shared/src/AuthPage.jsx';

export default function Login() {
  const nav = useNavigate();
  return <AuthPage view="in" brand="CAR-ENT" defaultRole="rent" forgotHref="/forgot-password" termsHref="/terms" home="/" />;
}