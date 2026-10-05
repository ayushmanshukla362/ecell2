/* eslint-disable react/prop-types */
import { PLACEHOLDER_IMAGE } from './contentUtils'

export default function ContentImage({ src, alt, ...props }) {
  return <img {...props} src={src || PLACEHOLDER_IMAGE} alt={alt} decoding={props.decoding || 'async'} onError={(event) => {
    event.currentTarget.onerror = null
    if (event.currentTarget.getAttribute('src') !== PLACEHOLDER_IMAGE) event.currentTarget.src = PLACEHOLDER_IMAGE
  }} />
}
