package com.xoxo.gossipai;

import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler;

/**
 * TWA delegasyon servisi + Google Play Faturalandirma.
 *
 * Varsayilan servisin tek farki: web sayfasindaki Digital Goods API
 * cagrilarini (urun fiyatlari, satin alma listesi) Play Billing'e iletir.
 * Manifest'te com.google.androidbrowserhelper.trusted.DelegationService
 * yerine bu sinif kayitli.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new DigitalGoodsRequestHandler(getApplicationContext()));
    }
}
