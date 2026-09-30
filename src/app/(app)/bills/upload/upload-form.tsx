'use client';

import { useTranslations } from 'next-intl';
import { DropZone } from '@/components/app/pieces-client';
import { Button } from '@/components/ui';
import { ActionForm } from '@/components/ui/form';
import { uploadBillAction } from '@/app/(app)/inbox/actions';

const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.html,.htm,.txt,.eml,application/pdf,image/*,text/html,text/plain';

/** The big drop zone: drop files, choose them, or take a photo; each upload starts at once. */
export function UploadForm() {
  const t = useTranslations('upload');
  return (
    <ActionForm action={uploadBillAction} submitLabel={t('submit')} hideSubmit className="up-form">
      {(_errors, pending) =>
        pending ? (
          <div className="drop glass rounded-card big">
            <span className="analysing">
              <i />
              {t('uploading')}
            </span>
          </div>
        ) : (
          <DropZone
            name="file"
            accept={ACCEPT}
            multiple
            submitOnPick
            big
            title={t('drop')}
            sub={t('dropSub')}
          >
            <div className="form-acts mid">
              <Button type="button" icon="file" tabIndex={-1}>
                {t('choose')}
              </Button>
              <Button type="button" variant="secondary" icon="photo" tabIndex={-1}>
                {t('takePhoto')}
              </Button>
            </div>
          </DropZone>
        )
      }
    </ActionForm>
  );
}
