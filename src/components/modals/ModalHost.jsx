import { useRef } from 'react'
import { useUiStore } from '@/store/useUiStore'
import SendModal from './SendModal'
import ReceiveModal from './ReceiveModal'
import TopUpModal from './TopUpModal'
import TxDetailModal from './TxDetailModal'
import EditProfileModal from './EditProfileModal'
import ExchangeModal from './ExchangeModal'

const MODALS = { send: SendModal, receive: ReceiveModal, topup: TopUpModal, tx: TxDetailModal, editProfile: EditProfileModal, exchange: ExchangeModal }

/**
 * Semua modal global dibuka lewat openModal(type, props) dari mana saja
 * (Home, Wallet, Profile, Chat). Props terakhir disimpan supaya animasi tutup tetap mulus.
 */
export default function ModalHost() {
  const modal = useUiStore((s) => s.modal)
  const close = useUiStore((s) => s.closeModal)
  const lastProps = useRef({})
  if (modal) lastProps.current[modal.type] = modal.props

  return Object.entries(MODALS).map(([type, Component]) => (
    <Component key={type} open={modal?.type === type} onClose={close} initial={lastProps.current[type] ?? {}} />
  ))
}
