import { render } from 'preact';
import { App } from './app.jsx';
import { init } from './store.js';
import './styles.css';

render(<App />, document.getElementById('app'));
init();
