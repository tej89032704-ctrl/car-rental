import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import AuthPage from '../../../../packages/shared/src/AuthPage.jsx';

export default function Signup() {
  const nav = useNavigate();
  /* Owner portal: this page creates car owners only. The "Rent a car" half of
     the role toggle belongs to the renter portal's signup, so passing a single
     role locks the toggle out of the form instead of offering a choice that
     lands the visitor in the wrong account type. */
  return <AuthPage view="up" brand="OwnerHub" roles={['list']} defaultRole="list" termsHref="/terms" home="/" />;
}