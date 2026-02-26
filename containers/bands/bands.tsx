import React from 'react';
import styles from './bands.module.css';

const bands = () => {
  return (
    <section className={styles.bands}>
      <h2>HF Bands I Operate</h2>
      <ul>
        <li>80m</li>
        <li>40m</li>
        <li>20m</li>
        <li>15m</li>
        <li>10m</li>
      </ul>
    </section>
  );
};

export default bands;