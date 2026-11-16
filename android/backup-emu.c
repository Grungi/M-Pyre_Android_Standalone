/* Real no-flash M-PYRE editor backup transport: project slots, Song order.
 * The official Song page uses BK_LIST/GET/PUT, not the native Song Studio API.
 * SPDX-License-Identifier: GPL-3.0-only
 */
#define EMU_BK_SETTINGS_BYTES 84u    /* PER3 magic, song starts at byte 48 */
static project_t emu_bk_snap[5], emu_bk_tmp;  /* four sections, working pattern */
static uint8_t emu_bk_settings[EMU_BK_SETTINGS_BYTES];
static uint8_t emu_bk_stage[sizeof(project_t)];
static uint8_t emu_bk_valid, emu_bk_put_active, emu_bk_id;
static uint32_t emu_bk_len, emu_bk_crc, emu_bk_off, emu_bk_ms;
static void emu_bk_u35(uint32_t v) {
    uint32_t i;
    for (i=0;i<5u;i++) ed_b((v>>(7u*i))&127u);
}
static uint32_t emu_bk_r35(const uint8_t *a) {
    return (uint32_t)a[0]|(uint32_t)a[1]<<7|(uint32_t)a[2]<<14|
        (uint32_t)a[3]<<21|(uint32_t)a[4]<<28;
}
static const uint8_t *emu_bk_obj(uint32_t id, uint32_t *len) {
    *len=0;
    if (id==0u) {
        *len=sizeof(project_t);
        return (const uint8_t *)&emu_bk_snap[4];
    }
    if (id==1u) {
        *len=sizeof emu_bk_settings;
        return emu_bk_settings;
    }
    if (id>=2u && id<=5u) {
        const project_t *p=&emu_bk_snap[id-2u];
        *len=proj_ok(p)?sizeof *p:0u;
        return (const uint8_t *)p;
    }
    return 0;
}
static void emu_bk_capture(void) {
    uint32_t i;
    for(i=0;i<4u;i++) memcpy(&emu_bk_snap[i],&emu_proj[i],sizeof(project_t));
    proj_capture(&emu_bk_snap[4]);
    memset(emu_bk_settings,0,sizeof emu_bk_settings);
    emu_bk_settings[0]=0x33u; emu_bk_settings[1]=0x52u;
    emu_bk_settings[2]=0x45u; emu_bk_settings[3]=0x50u;  /* PER3 */
    memcpy(emu_bk_settings+48,&arrangement,sizeof arrangement);
    emu_bk_valid=1;
    emu_bk_put_active=0;
}
static uint32_t emu_bk_commit(void) {
    uint32_t id=emu_bk_id, n=emu_bk_len;
    if(emu_bk_off!=n || st_crc32(emu_bk_stage,n)!=emu_bk_crc) return 2u;
    if(id==1u) {
        arr_config_t next;
        if(n!=EMU_BK_SETTINGS_BYTES || emu_bk_stage[0]!=0x33u ||
           emu_bk_stage[1]!=0x52u || emu_bk_stage[2]!=0x45u ||
           emu_bk_stage[3]!=0x50u) return 2u;
        memcpy(&next,emu_bk_stage+48,sizeof next);
        if(!arr_valid(&next,15u)) return 2u;
        if((song.playing||transport_req)&&memcmp(&next,&arrangement,sizeof next))
            return 3u;
        arrangement=next;
        emu_song_changed++;
        ui.force=1;
        return 0u;
    }
    if(song.playing||transport_req) return 3u;
    if(id>=2u && id<=5u && !n) {
        uint32_t slot=id-2u;
        memset(&emu_proj[slot],0,sizeof(project_t));
        if(live_sec==(int8_t)slot) live_sec=-1;
        if(arr_drop_scene(&arrangement,slot)) emu_song_changed++;
        emu_proj_gen++; ui.force=1;
        return 0u;
    }
    if(!n || id>5u || !proj_import(&emu_bk_tmp,emu_bk_stage,(int)n))
        return 2u;
    if(id==0u) {
        memcpy(&emu_proj[4],&emu_bk_tmp,sizeof(project_t));
        emu_apply(&emu_proj[4]);
    } else memcpy(&emu_proj[id-2u],&emu_bk_tmp,sizeof(project_t));
    emu_proj_gen++; ui.force=1;
    return 0u;
}
/* The unmodified upstream no-flash reply contains only rc=4.
 * This entrypoint builds the full physical BK protocol into ed_out. */
static int emu_ed_backup(uint32_t cmd, const uint8_t *a, uint32_t na) {
    uint32_t i,id,n,off,len,count,rc;
    const uint8_t *p;
    if(cmd==ED_BK_LIST) {
        emu_bk_capture();
        ed_b(0); ed_b(6);
        for(i=0;i<6u;i++) {
            p=emu_bk_obj(i,&len);
            ed_b(i); emu_bk_u35(len); emu_bk_u35(st_crc32(p,len));
        }
        return 1;
    }
    if(cmd==ED_BK_GET) {
        id=na?a[0]:127u;
        off=na>=6u?emu_bk_r35(a+1):0u;
        count=na>=8u?(uint32_t)a[6]|(uint32_t)a[7]<<7:0u;
        p=emu_bk_obj(id,&len);
        rc=na!=8u||!p||!count||count>256u||off>len||count>len-off
           ?1u:!emu_bk_valid?5u:0u;
        ed_b(id); ed_b(rc); emu_bk_u35(off);
        ed_b(rc?0u:count&127u); ed_b(rc?0u:count>>7);
        if(!rc) ed_pack7(p+off,count);
        return 1;
    }
    if(cmd==ED_BK_PUT) {
        uint32_t op=na>=2u?a[0]:99u;
        id=na>=2u?a[1]:127u;
        rc=1u;
        if(op==0u && na==12u && id<=5u) {
            n=emu_bk_r35(a+2);
            if(n<=sizeof emu_bk_stage && (id>=2u || n)) {
                emu_bk_put_active=1; emu_bk_valid=0;
                emu_bk_id=(uint8_t)id; emu_bk_len=n;
                emu_bk_crc=emu_bk_r35(a+7);
                emu_bk_off=0; emu_bk_ms=fm1_ms;
                rc=0u;
            }
        } else if(op==3u && na==2u && emu_bk_put_active && id==emu_bk_id) {
            emu_bk_put_active=0; rc=0u;
        } else if(!emu_bk_put_active || id!=emu_bk_id || fm1_ms-emu_bk_ms>15000u) {
            rc=5u;
        } else if(op==1u && na>=9u && emu_bk_r35(a+2)==emu_bk_off) {
            n=ed_unpack7(a+7,na-7u,ed_smp_buf,256u);
            if(n && n<=emu_bk_len-emu_bk_off) {
                memcpy(emu_bk_stage+emu_bk_off,ed_smp_buf,n);
                emu_bk_off+=n; emu_bk_ms=fm1_ms; rc=0u;
            }
        } else if(op==2u && na==2u) {
            rc=emu_bk_commit(); emu_bk_put_active=0;
        }
        ed_b(op&127u); ed_b(id&127u); ed_b(rc);
        return 1;
    }
    return 0;
}
