import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import AuthPage from '../../../../packages/shared/src/AuthPage.jsx';

export default function Signup() {
  const nav = useNavigate();
  /* Renter portal: this page creates renters only. The "List my car" half of
     the role toggle belongs to the owner portal's signup, so passing a single
     role locks the toggle out of the form instead of offering a choice that
     lands the visitor in the wrong account type. */
  return <AuthPage view="up" brand="CAR-ENT" roles={['rent']} defaultRole="rent" termsHref="/terms" home="/" />;
}