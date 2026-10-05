import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import AuthPage from '../../../../packages/shared/src/AuthPage.jsx';

export default function Signup() {
  const nav = useNavigate();
  return <AuthPage view="up" brand="OwnerHub" defaultRole="list" termsHref="/terms" home="/" />;
}